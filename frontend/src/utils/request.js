export default function request({
  url,
  method = 'post',
  data,
  headers = {},
  onProgress = e => e
}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.timeout = 60000;
    Object.keys(headers).forEach(key => {
      xhr.setRequestHeader(key, headers[key]);
    });
    xhr.upload.onprogress = onProgress;
    xhr.send(data);
    xhr.onload = e => {
      console.log(e);
      resolve({
        data: e.target.response
      });
    };
    xhr.onerror = err => {
      reject(err);
    };
  });
}
