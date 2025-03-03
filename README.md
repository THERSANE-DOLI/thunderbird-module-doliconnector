# Dolibarr connector 

## A Dolibarr add-on for Thunderbird

This module need configuration to work 

- [Thersane Add-on page](https://www.thersane.fr/content/60-plugin-thunderbird-pour-dolibarr)
- [See Thunderbird addons page](https://addons.thunderbird.net/fr/thunderbird/addon/dolibarr-connector/)

# How to build package xpi
## On linux 
run command or execute as a program (need zip command ```sudo apt install zip```)
```bash
buildXpi.sh
```
## On other Os
### 1. Build a Zip of the Folder's files
```
cd my-addon-folder
zip -r my-addon.zip *
```
### 2. Rename to `.xpi`
```
mv my-addon.zip my-addon.xpi
```

# install
- Open Thunderbird.
- Go to Add-ons & Themes (Ctrl+Shift+A).
- Click on the gear icon and select Install Add-on From File….
- Select your .xpi file and install it.

## Know issues
 In somes cases CORS errors can appears so try this in your .htaccess and i it work you will need to adapt your Access-Control-Allow-Origin
```
<IfModule mod_headers.c>
    Header always unset Access-Control-Allow-Origin
    Header always set Access-Control-Allow-Origin "*"
</IfModule>
```

# Contribute
see this start doc : [How to create hello world addon](https://developer.thunderbird.net/add-ons/hello-world-add-on)
