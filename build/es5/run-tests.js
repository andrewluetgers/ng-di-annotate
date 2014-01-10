"use strict";

var ngAnnotate = require("./ng-annotate-main");
var fs = require("fs");
var diff = require("diff");

function slurp(filename) {
    return String(fs.readFileSync(filename));
}

function test(correct, got, name) {
    if (got !== correct) {
        var patch = diff.createPatch(name, correct, got);
        process.stderr.write(patch);
        process.exit(-1);
    }
}

console.log("testing adding annotations");
var original = slurp("tests/original.js");
var annotated = ngAnnotate(original, {add: true}).src;
test(slurp("tests/with_annotations.js"), annotated, "with_annotations.js");

console.log("testing removing annotations");
var deAnnotated = ngAnnotate(annotated, {remove: true}).src;
test(original, deAnnotated, "original.js");

console.log("all ok");
