const { readFile } = require('fs');

readFile('./package.json', { encoding: 'utf-8' }, (err, data) => {
  if (err) throw err;
  console.log(data);
});

function fileTimestamp(fileName) {
  let fileNameArr = fileName.split('.');

  if (fileNameArr.length === 1) {
    return fileName + `_${new Date().getTime()}`;
  }

  let fileNameSuffix = fileNameArr[fileNameArr.length - 1];
  fileNameArr.pop();

  return fileNameArr.join('.') + `_${new Date().getTime()}.` + fileNameSuffix;
}
