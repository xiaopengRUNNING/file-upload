const { fileNameTimestamp } = require('./utils/file');
const express = require('express');
const path = require('path');
const fse = require('fs-extra');
const multi = require('multiparty');
const cors = require('cors');
const app = express();

const port = 3001;
const UPLOAD_DIR = path.resolve(__dirname, '..', 'Upload');
const TEMP_DIR = path.resolve(__dirname, '..', 'Temp');
console.log(path.join(TEMP_DIR, 'text'));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/index', (req, res) => {
  res.send('hello world');
});

app.post('/upload', (req, res) => {
  const multiparty = new multi.Form();

  multiparty.parse(req, async (err, fields, files) => {
    if (err) {
      return;
    }
    const fileDir = path.resolve(UPLOAD_DIR);

    // 判断文件目录是否存在，不存在就创建文件目录
    fse.ensureDir(fileDir);

    // 将文件移动到最终目录
    await fse.move(
      files.file[0].path,
      `${fileDir}/${fileNameTimestamp(files.file[0].originalFilename)}`
    );

    // 接口返回信息
    res.status(200).json({
      success: true,
      code: 200,
      messgae: '上传成功',
      timestamp: new Date().getTime()
    });
  });
});

app.post('/chunkUpload', (req, res) => {
  const multiparty = new multi.Form();

  multiparty.parse(req, async (err, fields, files) => {
    if (err) {
      console.log('err =>', err);
      return;
    }
    console.log('files=>', files);
    console.log('files=>', fields);
    // const fileDir = path.resolve(TEMP_DIR);

    // // 判断文件目录是否存在，不存在就创建文件目录
    // fse.ensureDir(fileDir);

    // // 将文件移动到最终目录
    // await fse.move(
    //   files.file[0].path,
    //   `${fileDir}/${files.file[0].originalFilename}`
    // );

    // 接口返回信息
    res.status(200).json({
      success: true,
      code: 200,
      messgae: '上传成功',
      timestamp: new Date().getTime()
    });
  });
});

app.post('/merge', (req, res) => {
  console.log('=======================', req.body);

  res.end('jjjjjj');
});

app.listen(port, () => console.log('正在监听 3001 端口'));

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

// server.listen(3001, () => console.log('正在监听 3001 端口'));
