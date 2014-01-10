"use strict";
var fs = require("fs");
var fmt = require("simple-fmt");
var tryor = require("tryor");
var ngAnnotate = require("./ng-annotate-main");
var version = "0.4.0";
var optimist = require("optimist")
    .usage("ng-annotate v" + version + "\n\nUsage: ng-annotate OPTIONS file.js")
    .options("a", {
        alias: "add",
        boolean: true,
        describe: "add dependency injection annotations where non-existing",
    })
    .options("r", {
        alias: "remove",
        boolean: true,
        describe: "remove all existing dependency injection annotations",
    })
    .options("regexp", {
        describe: "detect short form myMod.controller(...) iff myMod matches regexp",
    })
var argv = optimist.argv;

function exit(msg) {
    if (msg) {
        process.stderr.write(msg);
        process.stderr.write("\n");
    }
    process.exit(-1);
}

(function verifyOptions() {
    if (argv._.length !== 1) {
        optimist.showHelp();
        exit("error: no input file provided");
    }

    if (!argv.add && !argv.remove) {
        optimist.showHelp();
        exit("error: missing option --add and/or --remove");
    }
})();

var filename = argv._.shift();

if (!fs.existsSync(filename)) {
    exit(fmt('error: file not found {0}', filename));
}

var src = String(fs.readFileSync(filename));

var config = tryor(function() {
    return JSON.parse(String(fs.readFileSync("ng-annotate-config.json")));
}, {});

function addOption(opt) {
    if (opt in argv) {
        config[opt] = argv[opt];
    }
}

["add", "remove", "regexp"].forEach(addOption);

var ret = ngAnnotate(src, config);

if (ret.errors) {
    exit(ret.errors.join("\n"));
}

if (ret.src) {
    process.stdout.write(ret.src);
}
