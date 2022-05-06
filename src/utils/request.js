export default function request({
  url,
  method = 'post',
  data,
  headers = {},
  onProgress = e => e,
  onloadstart = e => e,
  onload = e => e,
  onerror = e => e
}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.timeout = 60000;
    Object.keys(headers).forEach(key => {
      xhr.setRequestHeader(key, headers[key]);
    });
    xhr.onloadstart = onloadstart;
    xhr.upload.onprogress = onProgress;
    xhr.send(data);
    xhr.onerror = err => {
      onerror();
      reject(err);
    };
    xhr.onload = e => {
      switch (e.currentTarget.status) {
        case 500:
          reject('报错了');
          break;
        default:
          onload();
          resolve({
            data: JSON.parse(e.target.response)
          });
          break;
      }
    };
  });
}
