function fileNameTimestamp(fileName) {
  let fileNameArr = fileName.split('.');

  if (fileNameArr.length === 1) {
    return fileName + `_${new Date().getTime()}`;
  }

  let fileNameSuffix = fileNameArr[fileNameArr.length - 1];
  fileNameArr.pop();

  return fileNameArr.join('.') + `_${new Date().getTime()}.` + fileNameSuffix;
}

export default fileNameTimestamp;
