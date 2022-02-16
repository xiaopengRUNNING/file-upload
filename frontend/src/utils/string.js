/**
 * 字符串转ArrayBuffer
 */
export function str2ab(str, fn) {
  let b = new Blob([str], { type: 'text/plain:charset=utf-8' });
  let r = new FileReader();
  r.readAsArrayBuffer(b);
  r.onload = e => {
    fn(e.target.result);
  };
}
