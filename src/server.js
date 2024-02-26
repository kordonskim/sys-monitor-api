// A lightweight API that exposes the system's current performance (such as disk, network, cpu/temperature etc)

const removeTrailingSpaces = require("remove-trailing-spaces");
var osu = require('node-os-utils');
var os1 = require('os');
var fs = require('fs');
var glob = require('glob').sync;
var express = require('express');
var Sequence = exports.Sequence || require('sequence').Sequence, sequence = Sequence.create(), err;
var app = express();

var LISTEN_PORT = process.env.LISTEN_PORT || 7777;
var THERMAL_ZONE = process.env.THERMAL_ZONE || "/sys/class/thermal/thermal_zone0/temp";
var CPUSPEEDPOLICY = process.env.CPUSPEEDPOLICY || true;
var CPUSPEEDNODEOS = process.env.CPUSPEEDNODEOS || true;

console.log("THERMAL_ZONE: " + THERMAL_ZONE);
console.log("CPUSPEEDPOLICY: " + CPUSPEEDPOLICY);
console.log("CPUSPEEDNODEOS: " + CPUSPEEDNODEOS);

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
        	var cpu_avg_speed_policy = 0;
        	var cpu_avg_speed_nodeos = 0;
        	var cpu_max_speed_policy = 0;
        	var cpu_max_speed_nodeos = 0;
        	var cpu_speeds_policy = {};
        	var cpu_speeds_nodeos = {};

			if (CPUSPEEDPOLICY){
				// base count on file count insetad os1.cpus().length
				var files = glob("/sys/devices/system/cpu/cpufreq/policy*");
				
				var cpu_count = files.length;
		       	for (let i = 0; i < cpu_count; i++){
	        		var fileName = "/sys/devices/system/cpu/cpufreq/policy" + i  + "/scaling_cur_freq";
		        	var data = fs.readFileSync(fileName, 'utf8');
	        	    if(data !== undefined) {
	        	    	var val = Math.round(parseInt(data.replace(/\D/g,'')) / 1000);
						cpu_avg_speed_policy += val;
						cpu_speeds_policy[i+1] = val;
						if (val > cpu_max_speed_policy)
							cpu_max_speed_policy = val;
	        		};
    	        };
	        	resObject.cpu_speeds_policy = cpu_speeds_policy;
	            resObject.cpu_avg_speed_policy = Math.round(cpu_avg_speed_policy / cpu_count);
	            resObject.cpu_max_speed_policy = cpu_max_speed_policy;
    	        
			}

            if (CPUSPEEDNODEOS){
            	var count = 1;
	        	os1.cpus().forEach((elem) => {
	        		cpu_speeds_nodeos[count] = elem.speed;
	        		cpu_avg_speed_nodeos += elem.speed;
	        		count ++;
	        		if(elem.speed > cpu_max_speed_nodeos)
	        			cpu_max_speed_nodeos = elem.speed;
        		});
	        	resObject.cpu_speeds_nodeos = cpu_speeds_nodeos;
	            resObject.cpu_avg_speed_nodeos = Math.round(cpu_avg_speed_nodeos / os1.cpus().length);
	            resObject.cpu_max_speed_nodeos = cpu_max_speed_nodeos;
            }
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
