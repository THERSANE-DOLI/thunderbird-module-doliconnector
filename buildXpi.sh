#!/bin/bash

execDir=`pwd`
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
name=`basename ${DIR}`

pushd ${DIR}
rm "${execDir}/${name}.xpi" 2> /dev/null
zip -r "${execDir}/${name}.xpi" ./ -x "${var}.xpi" -x "/*.git/*" -x "/*.gitignore" -x "/buildXpi.sh" -x "/.idea/*" -x "/.idea"
popd
