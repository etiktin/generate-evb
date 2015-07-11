# generate-evb

## Goal
Help you automate the process of generating an 'Enigma Virtual Box' project file (*.evb) as part of your normal build stage.

## Overview
[Enigma Virtual Box](http://enigmaprotector.com/en/aboutvb.html) is a great tool that allows you to package a Windows executable with all of the data and dependencies it needs in-order to run (dlls, assets, registry entries etc.). The tool takes care of the virtualization so you don't need to change your code in order for this to work. The packaged executable can read/write/execute files that were packed with him as if they were really in the file system and not virtualized (e.g. if you packed `./images/logo.png` into it, you can read the file from that path or even from the absolute path).
To create a packaged executable you need to create a project file that describes what needs to be packaged and some other virtualization attributes. The tool offers only a GUI for creating the project and there's no builtin support for recursively packing an entire folder (if some files were changed in one of the packed folders, you have to update the project manually). This is where we come in.

## Usage
Start by installing `generate-evb` locally:
```sh
npm install generate-evb --save-dev
```

Load the `generateEvb` function:
```javascript
var generateEvb = require('generate-evb');
```

The signature of `generateEvb` is:
```javascript
generateEvb(projectName, inputExe, outputExe, path2pack, templatePath);
```
Where:
- *projectName* (String) - the file path to which we want to save the generated evb file (e.g. 'build/myProject.evb')
- *inputExe* (String) - the input executable file path. Enigma packs the files from *path2pack* into a copy of this exe
- *outputExe* (String) - the output executable file path. Enigma saves the packed file to this path
- *path2pack* (String) - the path to the directory with the content that we want to pack into the copy of *inputExe*
- *templatePath* (Object) - optional, will default to the files in the templates directory:
    - *project* (String) - the path to a project template
    - *dir* (String) - the path to a directory template
    - *file* (String) - the path to a file template

Let's say that we want to pack a node project into `node.exe`. Our copy of node is located at `C:/Program Files (x86)/nodejs/node.exe`, so that will be the *inputExe*. The node project is located at `../foo` (all paths can be relative or absolute), so that's the *path2pack*. We want to save the packaged executable to `build/node.exe` so that will be our *outputExe*. And we will save the evb project to `build/packedNode.evb`, so that's the *projectName*.
Here's the code for this example:
```javascript
var generateEvb = require('generate-evb');

generateEvb('build/packedNode.evb', 'C:/Program Files (x86)/nodejs/node.exe', 'build/node.exe', '../foo');
```
After we run this we'll have the evb project file at `build/packedNode.evb`. To pack it, we can either open the project in `enigmavb.exe` (Enigma's GUI) and click on `Process`, or we can use `enigmavbconsole.exe` (Enigma's CLI) to pack it (example below).

Here's an example of packing the project through node:
```javascript
var fs = require('fs');
var child_process = require('child_process');

child_process.execFile('C:/Program Files (x86)/Enigma Virtual Box/enigmavbconsole.exe', [PROJECT_NAME], function (err, stdout, stderr) {
    var success = false;
    if (!err) {
        // Sanity check (change this to what works for you):
        // Check if the output file exists and if it's bigger than the input file
        if (fs.existsSync(OUTPUT_EXE)) {
            success = fs.statSync(OUTPUT_EXE).size > fs.statSync(INPUT_EXE).size;
        }

        if (!success) {
            err = new Error('Something is wrong! Please try again\nEVB stdout:\n' + stdout + '\nEVB stderr:\n' + stderr);
        }
    }
    if (err) {
    	throw err;
    }
});
```


