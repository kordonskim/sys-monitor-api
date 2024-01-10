// A lightweight API that exposes the system's current performance (such as disk, network, cpu/temperature etc)

const removeTrailingSpaces = require("remove-trailing-spaces");
var osu = require('node-os-utils')
var express = require("express");
var Sequence = exports.Sequence || require('sequence').Sequence, sequence = Sequence.create(), err;
var app = express();

var LISTEN_PORT = process.env.LISTEN_PORT || 7777;

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
                require('fs').readFile("/sys/class/thermal/thermal_zone0/temp", "utf8", function(err, data){
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
            var info = cpu.average()
            resObject.cpu_average = info;
            next();
        })
        // .then(function (next) {
        //     drive.info()
        //         .then(status => {
        //             resObject.drive = status;
        //             next();
        //         })
        // })
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
            resObject.os_uptime = os.uptime();
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