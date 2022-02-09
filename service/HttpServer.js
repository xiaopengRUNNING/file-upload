import express from 'express';
import bodyParser from 'body-parser';
import path, { resolve } from 'path';
import fse from 'fs-extra';
import multi from 'multiparty';
import cors from 'cors';

const app = express();

const port = 3001;
const UPLOAD_DIR = path.resolve('..', 'Upload');

// 解决跨域问题
app.use(cors());
// 获取post请求参数
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.post('/checkFileStatus', (req, res) => {
  new Promise((resolve, reject) => {
    const fileHash = req.body.fileHash;
    const fileName = req.body.fileName;

    const fileDir = path.resolve(UPLOAD_DIR, fileHash, fileName);
    const fileHashDir = path.resolve(UPLOAD_DIR, fileHash);

    if (fse.existsSync(fileDir)) {
      res.json({
        code: 200,
        message: '操作成功',
        result: {
          fileExists: true,
          fileChunk: null,
          url: path.join(fileHash, fileName)
        },
        success: true
      });
    } else if (fse.existsSync(fileHashDir)) {
      fse.readdir(path.resolve(fileHashDir), (err, files) => {
        if (err) {
          reject(err);
        } else {
          res.json({
            code: 200,
            message: '操作成功',
            result: {
              fileExists: false,
              fileChunk: files,
              url: null
            },
            success: true
          });
        }
      });
    } else {
      res.json({
        code: 200,
        messgae: '操作成功',
        result: {
          fileExists: false,
          fileChunk: [],
          url: null
        },
        success: true
      });
    }
  }).catch(err => {
    res.json({
      code: 500,
      messgae: `操作失败，${err}`,
      result: null,
      success: false
    });
  });
});

app.post('/chunkUpload', (req, res) => {
  new Promise((resolve, reject) => {
    const multiparty = new multi.Form();

    multiparty.parse(req, async (err, fields, files) => {
      if (err) {
        reject(err);
      }

      // 将文件移动到最终目录
      fse.move(
        files.file[0].path,
        path.resolve(UPLOAD_DIR, fields.fileHash[0], fields.chunkIndex[0]),
        // path.resolve(
        //   UPLOAD_DIR,
        //   fields.fileHash[0],
        //   files.file[0].originalFilename
        // ),
        // path.resolve(UPLOAD_DIR, fields.fileHash[0], fields.fileName[0]),
        err => {
          if (err) {
            reject(err);
            return;
          }
          res.json({
            code: 200,
            message: '上传成功',
            return: null,
            success: true
          });
        }
      );
    });
  }).catch(err => {
    res.json({
      code: 500,
      messgae: `操作失败，${err}`,
      result: null,
      success: false
    });
  });
});

app.post('/mergeFile', (req, res) => {
  new Promise((resolve, reject) => {
    console.log(req.body);
    res.json({
      code: 500,
      messgae: '操作成功',
      result: null,
      success: false
    });
  }).catch(err => {
    res.json({
      code: 500,
      messgae: `操作失败，${err}`,
      result: null,
      success: false
    });
  });
});

app.listen(port, () => console.log(`正在监听 ${port} 端口`));

// const server = http.createServer();
// const UPLOAD_DIR = path.resolve(__dirname, '..', 'target');

// const resolvePost = req =>
//   new Promise(resolve => {
//     let chunk = '';
//     req.on('data', data => {
//       chunk += data;
//     });
//     req.on('end', () => {
//       resolve(JSON.parse(chunk));
//     });
//   });

// const pipeStream = (path, writeStream) => {
//   new Promise(resolve => {
//     const readStream = fse.createReadStream(path);
//     readStream.on('end', () => {
//       fse.unlinkSync(path);
//       resolve();
//     });
//     readStream.pipe(writeStream);
//   });
// };

// const mergeFileChunk = async (filePath, filename, size) => {
//   const chunkDir = path.resolve(UPLOAD_DIR);
//   const chunkPaths = await fse.readdir(chunkDir);
//   chunkPaths.sort((a, b) => a.split('-')[0] - b.split('-'[1]));
//   await Promise.all(
//     chunkPaths.map((chunkPath, index) => {
//       pipeStream(
//         path.resolve(chunkDir, chunkPath),
//         fse.createWriteStream(filePath, { start: index * size, end: (index + 1) * size })
//       );
//     })
//   );
//   // fse.rmdirSync(chunkDir);
// };

// server.on('request', async (req, res) => {
//   res.setHeader('Access-Control-Allow-Origin', '*');
//   res.setHeader('Access-Control-Allow-Headers', '*');

//   if (req.method === 'OPTIONS') {
//     res.status = 200;
//     res.end();
//     return;
//   }

//   if (req.url === '/merge') {
//     const data = await resolvePost(req);
//     const { filename, size } = data;
//     const filePath = path.resolve(UPLOAD_DIR, `${filename}`);
//     await mergeFileChunk(filePath, filename, size);
//     res.end(
//       JSON.stringify({
//         code: 0,
//         message: 'file merged success'
//       })
//     );
//   }

//   const multiparty1 = new multiparty.Form();

//   multiparty1.parse(req, async (err, fields, files) => {
//     if (err) {
//       return;
//     }
//     const [chunk] = files.chunk;
//     const [hash] = fields.hash;
//     const [filename] = fields.filename;
//     const chunkDir = path.resolve(UPLOAD_DIR);

//     if (!fse.existsSync(chunkDir)) {
//       await fse.mkdirs(chunkDir);
//     }
//     await fse.move(chunk.path, `${chunkDir}/${hash}`);
//     res.end('received file chunk');
//   });
// });

// server.listen(3000, () => console.log('正在监听 3000 端口'));
