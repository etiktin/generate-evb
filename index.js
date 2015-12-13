'use strict';

var fs = require('graceful-fs');
var resolvePath = require('path').resolve;
var joinPath = require('path').join;
var mergeOptions = require('merge-options');

var DEFAULT_TEMPLATE_PATH = {
    PROJECT: resolveDefaultTemplatePath('project-template.xml'),
    DIR: resolveDefaultTemplatePath('dir-template.xml'),
    FILE: resolveDefaultTemplatePath('file-template.xml')
};

var RE = {
    PRE_TAG_INDENTS: /^\s+?</mg,

    DIR_NAME: getInjectRegExp('dirName'),
    FILES: getInjectRegExp('files'),
    FILE_NAME: getInjectRegExp('fileName'),
    FILE_PATH: getInjectRegExp('filePath'),
    INPUT_EXE: getInjectRegExp('inputExe'),
    OUTPUT_EXE: getInjectRegExp('outputExe'),

    OPT_DELETE_EXTRACTED: getInjectRegExp('deleteExtractedOnExit'),
    OPT_COMPRESS_FILES: getInjectRegExp('compressFiles'),
    OPT_SHARE_VIRTUAL_SYSTEM: getInjectRegExp('shareVirtualSystem'),
    OPT_MAP_WITH_TEMP: getInjectRegExp('mapExecutableWithTemporaryFile'),
    OPT_ALLOW_RUNNING_VIRTUAL_EXE: getInjectRegExp('allowRunningOfVirtualExeFiles')
};

// Helper to get absolute path to template
function resolveDefaultTemplatePath(templateName) {
    return joinPath(__dirname, 'templates', templateName);
}

// Helper to generate a regular expression which will match strings that look like:
// '<!-- inject: ' + what + ' -->'
function getInjectRegExp(what) {
    return new RegExp('<!--\\s*?inject\\s*?:\\s*?' + what + '\\s*?-->', 'i');
}

// Take a template path, read/load it's content and return it. If we fail to load the file, we will throw an appropriate
// error.
// Note: The template file should be encoded in UCS2/UTF16LE (that's the encoding that Enigma Virtual Box expects)
function loadTemplate(templatePath) {
    var contents;
    try {
        contents = fs.readFileSync(resolvePath(templatePath), 'ucs2');
        // We remove indents to trim down template size (you can always beautify/prettify the end result if you wish)
        contents = contents.replace(RE.PRE_TAG_INDENTS, '<');
    } catch (e) {
        e.message = "Failed to load template. Template path: '" + templatePath + "'.\n" + e.message;
        throw e;
    }
    return contents;
}

// The default filter approves adding all files and directories
function defaultFilter(fullPath, name, isDir) {
    return true;
}

// The Dir class represents a directory
function Dir(name, tree) {
    this.name = name;
    this.tree = tree;
}

// Take a path and return an array that will contain the entire file list located at that path (sub directories and
// everything). For a file the matching array element will be a String containing it's name (no path). For a directory
// the matching element is going to be an Object that has a `name` key that holds the directory name (String) and a
// `tree` key that holds an Array returned from readDirTree
function readDirTree(path) {
    var dirTree = fs.readdirSync(path);
    var n = dirTree.length;
    var name;
    var innerPath;
    var stats;
    var dir;

    while (n--) {
        name = dirTree[n];
        innerPath = resolvePath(path, name);
        stats = fs.lstatSync(innerPath);
        if (stats.isDirectory()) {
            // Create dir object
            dir = new Dir(name, readDirTree(innerPath));
            // Replace dir name with dir tree
            dirTree[n] = dir;
        }
    }
    return dirTree;
}

// Take a path to pack, along with templates and return a xml (String) that can be placed as the value of a `Files` tag.
// The `filter` function is used to decide if the file or directory should be added to xml (return true) or not (return
// false). If we fail to read the directory tree for the provided path, it will throw an appropriate error
function generateDirTreeXml(path2Pack, dirTemplate, fileTemplate, filter) {

    // Helper for the recursive creation of the xml
    var generateDirTreeXmlPart = function (path, dirTree) {
        var parts = [];
        dirTree.forEach(function (element) {
            var isDir = element instanceof Dir;
            var name = isDir ? element.name : element;
            var fullPath = joinPath(path, name);
            var part;
            var filesXml;

            // Check if the caller wants to skip this file or directory
            if (!filter(fullPath, name, isDir)) {
                return;
            }

            if (isDir) {
                // The element describes a directory
                part = dirTemplate.replace(RE.DIR_NAME, name);
                filesXml = generateDirTreeXmlPart(fullPath, element.tree);
                part = part.replace(RE.FILES, filesXml);
            } else {
                // The element describes a file
                part = fileTemplate.replace(RE.FILE_NAME, element);
                part = part.replace(RE.FILE_PATH, fullPath);
            }
            // Add the xml for the element
            parts.push(part);
        });
        // We return a xml string for the current dirTree
        return parts.join('');
    };

    var dirTree;
    try {
        dirTree = readDirTree(path2Pack);
    } catch (e) {
        e.message = "Failed to read the directory tree of: '" + path2Pack + "'.\n" + e.message;
        throw e;
    }

    return generateDirTreeXmlPart(path2Pack, dirTree);
}

// This is the entry point to the module.
// In this function we synchronously generate an 'Enigma Virtual Box' project file. The file will include entries for
// all the files and dirs located at `path2Pack`, so when you process the project using Enigma's GUI/CLI you will get an
// executable with all the files packed into it.
// - projectName (String) - the file path to which we want to save the generated evb file (e.g. 'build/myProject.evb')
// - inputExe (String) - the input executable file path. Enigma packs the files from `path2Pack` into a copy of this exe
// - outputExe (String) - the output executable file path. Enigma saves the packed file to this path
// - path2Pack (String) - the path to the directory with the content that we want to pack into the copy of inputExe
// - options (Object) - optional
//     - filter (Function) - optional, if provided it will be called with each file and directory from `path2Pack`. The
//         function should return true for any file or directory the user want to pack, and false for anything else
//     - templatePath (Object) - optional, will default to the files in the templates directory:
//         - project (String) - optional, path to a project template
//         - dir (String) - optional, path to a directory template
//         - file (String) - optional, path to a file template
//     - evbOptions (Object) - optional:
//         - deleteExtractedOnExit (Boolean) - defaults to true
//         - compressFiles (Boolean) - defaults to true
//         - shareVirtualSystem (Boolean) - defaults to false
//         - mapExecutableWithTemporaryFile (Boolean) - defaults to true
//         - allowRunningOfVirtualExeFiles (Boolean) - defaults to true
module.exports = function generate(projectName, inputExe, outputExe, path2Pack, options) {
    // Merge options with defaults
    options = mergeOptions({
        filter: defaultFilter,
        templatePath: {
            project: DEFAULT_TEMPLATE_PATH.PROJECT,
            dir: DEFAULT_TEMPLATE_PATH.DIR,
            file: DEFAULT_TEMPLATE_PATH.FILE
        },
        evbOptions: {
            deleteExtractedOnExit: true,
            compressFiles: true,
            shareVirtualSystem: false,
            mapExecutableWithTemporaryFile: true,
            allowRunningOfVirtualExeFiles: true
        }
    }, options);
    var templatePath = options.templatePath;
    var evbOptions = options.evbOptions;

    // Load templates
    var projectTemplate = loadTemplate(templatePath.project);
    var dirTemplate = loadTemplate(templatePath.dir);
    var fileTemplate = loadTemplate(templatePath.file);

    // Fill the project template
    projectTemplate = projectTemplate.
        // Set input and output executables
        replace(RE.INPUT_EXE, resolvePath(inputExe)).
        replace(RE.OUTPUT_EXE, resolvePath(outputExe)).
        // Set options
        replace(RE.OPT_DELETE_EXTRACTED, Boolean(evbOptions.deleteExtractedOnExit).toString()).
        replace(RE.OPT_COMPRESS_FILES, Boolean(evbOptions.compressFiles).toString()).
        replace(RE.OPT_SHARE_VIRTUAL_SYSTEM, Boolean(evbOptions.shareVirtualSystem).toString()).
        replace(RE.OPT_MAP_WITH_TEMP, Boolean(evbOptions.mapExecutableWithTemporaryFile).toString()).
        replace(RE.OPT_ALLOW_RUNNING_VIRTUAL_EXE, Boolean(evbOptions.allowRunningOfVirtualExeFiles).toString()).
        // Add files
        replace(RE.FILES, generateDirTreeXml(resolvePath(path2Pack), dirTemplate, fileTemplate, options.filter));

    // Save the project to file
    // Note: When you create a project manually using Enigma's GUI it prepends BOM (byte order mark) to the file.
    // fs.writeFile doesn't do that, but it doesn't seem to cause any issue with Enigma. If an issue related to the
    // missing BOM arises, we can add it by prepending '\ufeff' to projectTemplate (for details see:
    // http://stackoverflow.com/a/27975629)
    fs.writeFileSync(resolvePath(projectName), projectTemplate, 'ucs2');
};
