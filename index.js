'use strict';

var fs = require('graceful-fs');
var resolvePath = require('path').resolve;
var joinPath = require('path').join;

var DEFAULT_TEMPLATE_PATH = {
    PROJECT: _resolveTemplatePath('project-template.xml'),
    DIR: _resolveTemplatePath('dir-template.xml'),
    FILE: _resolveTemplatePath('file-template.xml')
};

var RE = {
    PRE_TAG_INDENTS: /^\s+?</mg,
    INJECT_DIR_NAME: _getInjectRegExp('dirName'),
    INJECT_FILES: _getInjectRegExp('files'),
    INJECT_FILE_NAME: _getInjectRegExp('fileName'),
    INJECT_FILE_PATH: _getInjectRegExp('filePath'),
    INJECT_INPUT_EXE: _getInjectRegExp('inputExe'),
    INJECT_OUTPUT_EXE: _getInjectRegExp('outputExe')
};

// Helper to get absolute path to template
function _resolveTemplatePath(templateName) {
    return joinPath(__dirname, 'templates', templateName);
}

// Helper to generate a regular expression which will match strings that look like:
// '<!-- inject: ' + key + ' -->'
function _getInjectRegExp(key) {
    return new RegExp('<!--\\s*?inject\\s*?:\\s*?' + key + '\\s*?-->', 'i');
}

// The Dir class represents a directory
function Dir(name, tree) {
    this.name = name;
    this.tree = tree;
}

// Take a path and return an array that will contain the entire file list located at that path (sub directories and
// everything). For a file the matching array element will be a String containing it's name (no path). For a directory
// the matching element is going to be an Object that has a 'name' key that holds the directory name (String) and a
// 'tree' key that holds an Array returned from readDirTree
function readDirTree(path) {
    var dirTree = fs.readdirSync(path);
    var n = dirTree.length;
    var name,
        innerPath,
        stats,
        dir;

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

// Take a template path, read/load it's content and return it. If we fail to load the file, we will throw an appropriate
// error.
// Note: The template file should be encoded in UCS2/UTF16LE (that's the encoding the Enigma expects)
function loadTemplate(templatePath) {
    var contents;
    try {
        contents = fs.readFileSync(templatePath, {encoding: 'ucs2'});
        // We remove indents to trim down template size (you can always beautify/prettify the end result if you wish)
        contents = contents.replace(RE.PRE_TAG_INDENTS, '<');
    } catch (e) {
        e.message = "Failed to load template. Template path: '" + templatePath + "'.\n" + e.message;
        throw e;
    }
    return contents;
}

// Take a path to pack along with templates and return a xml string that can be placed as the value of a 'Files' tag. If
// we fail to read the directory tree for the provided path we will throw an appropriate error
function generateDirTreeXml(path2pack, dirTemplate, fileTemplate) {

    // Helper for the recursive creation of the xml
    var generateDirTreeXmlPart = function (path, dirTree) {
        var parts = [];
        var part,
            filesXml;
        dirTree.forEach(function (element) {
            if (element instanceof Dir) {
                // The element describes a directory
                part = dirTemplate.replace(RE.INJECT_DIR_NAME, element.name);
                filesXml = generateDirTreeXmlPart(joinPath(path, element.name), element.tree);
                part = part.replace(RE.INJECT_FILES, filesXml);
            } else {
                // The element describes a file
                part = fileTemplate.replace(RE.INJECT_FILE_NAME, element);
                part = part.replace(RE.INJECT_FILE_PATH, joinPath(path, element));
            }
            // Add the xml for the element
            parts.push(part);
        });
        // We return a xml string for the current dirTree
        return parts.join('');
    };

    var dirTree;
    try {
        dirTree = readDirTree(path2pack);
    } catch (e) {
        e.message = "Failed to read the directory tree of: '" + path2pack + "'.\n" + e.message;
        throw e;
    }

    return generateDirTreeXmlPart(path2pack, dirTree);
}

// This is the entry point to the module.
// In this function we synchronously generate an 'Enigma Virtual Box' project file. The file will include entries for
// all the files and dirs located at 'path2pack', so when you process the project using Enigma's GUI/CLI you will get an
// executable with all the files packed into it.
// - projectName (String) - the file path to which we want to save the generated evb file (e.g. './build/myapp.evb')
// - inputExe (String) - the input executable file path. Enigma packs the files from 'path2pack' into a copy of this exe
// - outputExe (String) - the output executable file path. Enigma saves the packed file to this path
// - path2pack (String) - the path to the directory with the content that we want to pack into the inputExe copy
// - templatePath (Object - optional, will default to the files in the templates directory):
//      - project (String) - the path to a project template
//      - dir (String) - the path to a directory template
//      - file (String) - the path to a file template
module.exports = function generate(projectName, inputExe, outputExe, path2pack, templatePath) {
    // Resolve the paths for the different templates
    templatePath = templatePath || {};
    templatePath.project = resolvePath(templatePath.project || DEFAULT_TEMPLATE_PATH.PROJECT);
    templatePath.dir = resolvePath(templatePath.dir || DEFAULT_TEMPLATE_PATH.DIR);
    templatePath.fil = resolvePath(templatePath.fil || DEFAULT_TEMPLATE_PATH.FILE);

    // Load templates
    var projectTemplate = loadTemplate(templatePath.project);
    var dirTemplate = loadTemplate(templatePath.dir);
    var fileTemplate = loadTemplate(templatePath.fil);

    // Fill the project template
    projectTemplate = projectTemplate
        .replace(RE.INJECT_INPUT_EXE, resolvePath(inputExe))
        .replace(RE.INJECT_OUTPUT_EXE, resolvePath(outputExe))
        .replace(RE.INJECT_FILES, generateDirTreeXml(path2pack, dirTemplate, fileTemplate));

    // Save the project to file
    // Note: When you create a project manually using Enigma's GUI it prepends BOM (byte order mark) to the file.
    // fs.writeFile doesn't do that, but it doesn't seem to cause any issue with Enigma. If an issue related to the
    // missing BOM arises, we can add it by prepending '\ufeff' to projectTemplate
    fs.writeFileSync(resolvePath(projectName), projectTemplate, {encoding: 'ucs2'});
};
