// A lightweight API that exposes the system's current performance (such as disk, network, cpu/temperature etc)

const removeTrailingSpaces = require("remove-trailing-spaces");
var osu = require('node-os-utils');
var os1 = require('os');
var fs = require('fs');
var express = require("express");
var Sequence = exports.Sequence || require('sequence').Sequence, sequence = Sequence.create(), err;
var app = express();

var LISTEN_PORT = process.env.LISTEN_PORT || 7778;
var THERMAL_ZONE = process.env.THERMAL_ZONE || "/sys/class/thermal/thermal_zone0/temp";

console.log("THERMAL_ZONE: " + THERMAL_ZONE);

app.listen(LISTEN_PORT, () => {
    console.log("Server running on port " + LISTEN_PORT);
});

app.get("/", (req, res, next) => {
    buildResources(function(responseObject) {
        res.json(responseObject);
    });
});

app.get("/healthcheck", (req, res, next) => {
    res.json(true);
});


function buildResources(callback) {

    var cpu = osu.cpu;
    var drive = osu.drive;
    var mem = osu.mem;
    var netstat = osu.netstat;
    var os = osu.os;
    
    var resObject = {};
    
    sequence
        .then(function (next) {
            resObject.cpu_model = removeTrailingSpaces(cpu.model());
            next();
        })       
        .then(function (next) {
            try {
                require('fs').readFile(THERMAL_ZONE, "utf8", function(err, data){
                    if(data !== undefined) {
                        var temperature = parseInt(data.replace(/\D/g,''));
                        temperature = Math.round((temperature * 0.001) * 100) / 100;
                        resObject.cpu_temperature = temperature;
                    }
                    next();
                });
            } catch (err) {
                resObject.cpu_temperature = 0;
                next();
            }
        })
        .then(function (next) {
            resObject.cpu_load1 = cpu.loadavgTime(1).toFixed(2);
            next();
        })     
        .then(function (next) {
            resObject.cpu_load5 = cpu.loadavgTime(5).toFixed(2);
            next();
        })     
        .then(function (next) {
            resObject.cpu_load15 = cpu.loadavgTime(15).toFixed(2);
            next();
        })     
        .then(function (next) {
            cpu.usage()
                .then(status => {
                    resObject.cpu_current = status.toFixed(2);
                    next();
                })
        })
        .then(function (next) {
            cpu.free()
                .then(status => {
                    resObject.cpu_free = status.toFixed(2);
                    next();
                })
        })
        .then(function (next) {
            var info = cpu.average();
            resObject.cpu_average = info;
            next();
        })
        .then(function(next) {
        	var count = 1;
        	var avgSpeed = 0;
        	var maxSpeed = 0;
        	var dict = {};
	       	for (let i = 0; i < os1.cpus().length; i++){
	        		var fileName = "/sys/devices/system/cpu/cpufreq/policy" + i  + "/scaling_cur_freq";
		        	var data = fs.readFileSync(fileName, 'utf8');
	        	    if(data !== undefined) {
	        	    	var val = Math.round(parseInt(data.replace(/\D/g,'')) / 1000);
						avgSpeed += val;
						dict[i+1] = val;
						if (val > maxSpeed)
							maxSpeed = val;
	        		};
            };
//            resObject.avgSpeed2 = Math.round(total / os1.cpus().length);
//        	os1.cpus().forEach((elem) => {
//        		dict[count] = elem.speed;
//        		arr.push(elem.speed);
//        		avgSpeed += elem.speed;
//        		count ++;
//        		if(elem.speed > maxSpeed)
//        			maxSpeed = elem.speed;
//        	});
        	resObject.cpusSpeeds = dict;
            resObject.avgSpeed = Math.round(avgSpeed / os1.cpus().length);
            resObject.maxSpeed = maxSpeed;
            next();
        })
        .then(function (next) {
            drive.info()
                .then(status => {
                    resObject.drive = status;
                    next();
                })
        })
        .then(function (next) {
            mem.info()
                .then(status => {
                    resObject.memory = status;
                    next();
                })
        })
        .then(function (next) {
            netstat.stats()
                .then(status => {

                    var networkKeys = {}, itemsProcessed = 0;

                    Object.keys(status).forEach(function(key) {
                        var val = status[key];
                        networkKeys[val.interface] = val;
                        
                        itemsProcessed++;
                        if(itemsProcessed === status.length) {
                            resObject.network = networkKeys;
                            next();
                        }
                    });
                })
        })
        // Get the wireless network strength if we can and also push it into the network array...
        .then(function (next) {
            try {
                // /proc/net/wireless | /sys/class/wireless
                require('fs').readFile("/proc/net/wireless", "utf8", function(err, data) {
                    if(data !== undefined) {
                        var wirelessSignal = data.split("\n");

                        Object.keys(resObject.network).forEach(function(key) {
                            var val = resObject.network[key].interface;

                            for(i in wirelessSignal) {
                                var wirelessItems = wirelessSignal[i].split(/\s+/).filter(function(e){ return e === 0 || e });
                                
                                var firstLine = wirelessItems[0];
                                if(firstLine !== undefined) { 
                                    firstLine = firstLine.replace(/:/g, '');

                                    if(firstLine == val) {
                                        resObject.network[key].wireless = {
                                            qualityLink: wirelessItems[2].replace(/\./g, ""),
                                            qualityLevel: wirelessItems[3].replace(/\./g, ""),
                                            qualityNoise: wirelessItems[4],
                                            packetsNwid: wirelessItems[5],
                                            packetsCrypt: wirelessItems[6],
                                            packetsFrag: wirelessItems[7],
                                            packetsRetry: wirelessItems[8],
                                            packetsMisc: wirelessItems[9],
                                            missedBeacons: wirelessItems[10]
                                        }
                                    }
                                }
                            }
                        });
                        resObject.wifiStats = true;
                    } else {
                        resObject.wifiStats = false;
                    }
                    next();
                });
            } catch (err) {
                resObject.wifiStats = false;
                next();
            }
        })
        .then(function(next) {
            var days = os.uptime() / 86400;
            resObject.os_uptime =  days.toFixed(2);
            next();
        })
        .then(function(next) {
            resObject.oos = os.oos();
            next();
        })         
        .then(function(next) {
            resObject.platform = os.platform();
            next();
        })        
        .then(function (next) {
            callback(resObject);
            next();
        })
}
