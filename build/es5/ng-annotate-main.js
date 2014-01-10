"use strict";
var esprima = require("esprima").parse;
var is = require("simple-is");
var alter = require("alter");
var traverse = require("ast-traverse");

function match(node, re) {
    return matchRegular(node, re) ||
        matchDirectiveReturnObject(node) ||
        matchProviderGet(node);
}

function matchDirectiveReturnObject(node) {
    // return { .. controller: function($scope, $timeout), ...}

    return node.type === "ReturnStatement" &&
        node.argument && node.argument.type === "ObjectExpression" &&
        matchProp("controller", node.argument.properties);
}

function matchProviderGet(node) {
    // this.$get = function($scope, $timeout)
    // { ... $get: function($scope, $timeout), ...}

    return (node.type === "AssignmentExpression" && node.left.type === "MemberExpression" &&
        node.left.object.type === "ThisExpression" && node.left.property.name === "$get" && node.right) ||
        (node.type === "ObjectExpression" && matchProp("$get", node.properties));
}

function matchRegular(node, re) {
    // Short form: *.controller("MyCtrl", function($scope, $timeout) {});
    function isShortDef(node, re) {
        return is.string(node.name) && (!re || re.test(node.name));
    }

    // Long form: angular.module(*).controller("MyCtrl", function($scope, $timeout) {});
    function isLongDef(node) {
        return node.callee &&
            node.callee.object && (node.callee.object.name === "angular" || node.callee.object.name === "di") &&
            node.callee.property && node.callee.property.name === "module";
    }

    if (node.type !== "CallExpression") {
        return;
    }

    var callee = node.callee;
    if (callee.type !== "MemberExpression") {
        return false;
    }
    var obj = callee.object;
    var prop = callee.property;
    if (!obj || !prop) {
        return false;
    }
    var matchAngularModule = (obj.$chained || isShortDef(obj, re) || isLongDef(obj)) &&
        is.someof(prop.name, ["provider", "value", "constant", "config", "factory", "directive", "filter", "run", "controller", "service", "decorator", "animation"]);
    if (!matchAngularModule) {
        return false;
    }
    node.$chained = true;

    if (is.someof(prop.name, ["value", "constant"])) {
        return false; // affects matchAngularModule because of chaining
    }

    var args = node.arguments;
    return (is.someof(prop.name, ["config", "run"]) ?
        args.length === 1 && args[0] :
        args.length === 2 && args[0].type === "Literal" && is.string(args[0].value) && args[1]);
}

function last(arr) {
    return arr[arr.length - 1];
}

function matchProp(name, props) {
    for (var i = 0; i < props.length; i++) {
        var prop = props[i];
        if (prop.key.type === "Identifier" && prop.key.name === name) {
            return prop.value; // FunctionExpression or ArrayExpression
        }
    }
    return null;
}

function insertArray(functionExpression, fragments) {
    var range = functionExpression.range;

    var args = JSON.stringify(functionExpression.params.map(function(arg) {
        return arg.name;
    }));
    fragments.push({
        start: range[0],
        end: range[0],
        str: args.slice(0, -1) + ", ",
    });
    fragments.push({
        start: range[1],
        end: range[1],
        str: "]",
    });
}

function replaceArray(array, fragments) {
    var functionExpression = last(array.elements);

    if (functionExpression.params.length === 0) {
        return removeArray(array, fragments);
    }
    var args = JSON.stringify(functionExpression.params.map(function(arg) {
        return arg.name;
    }));
    fragments.push({
        start: array.range[0],
        end: functionExpression.range[0],
        str: args.slice(0, -1) + ", ",
    });
}

function removeArray(array, fragments) {
    var functionExpression = last(array.elements);

    fragments.push({
        start: array.range[0],
        end: functionExpression.range[0],
        str: "",
    });
    fragments.push({
        start: functionExpression.range[1],
        end: array.range[1],
        str: "",
    });
}

function isAnnotatedArray(node) {
    return node.type === "ArrayExpression" && node.elements.length >= 1 && last(node.elements).type === "FunctionExpression";
}
function isFunctionWithArgs(node) {
    return node.type === "FunctionExpression" && node.params.length >= 1;
}

module.exports = function ngAnnotate(src, options) {
    var mode = (options.add && options.remove ? "rebuild" :
        options.remove ? "remove" :
            options.add ? "add" : null);

    if (!mode) {
        return {src: src};
    }

    var re = (options.regexp && new RegExp(options.regexp));
    var ast = esprima(src, {
        range: true,
    });

    var fragments = [];

    traverse(ast, {post: function(node) {
        var target = match(node, re);
        if (!target) {
            return;
        }

        if (mode === "rebuild" && isAnnotatedArray(target)) {
            replaceArray(target, fragments);
        } else if (mode === "remove" && isAnnotatedArray(target)) {
            removeArray(target, fragments);
        } else if (is.someof(mode, ["add", "rebuild"]) && isFunctionWithArgs(target)) {
            insertArray(target, fragments);
        }
    }});

    var out = alter(src, fragments);

    return {
        src: out,
    };
}
