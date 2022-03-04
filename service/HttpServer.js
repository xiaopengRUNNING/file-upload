import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
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
              fileChunk: files.filter(v => !v.startsWith('.')),
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
        return;
      }

      // 模拟分片上传报错
      if (Math.random() > 0.5) {
        reject(new Error('测试报错'));
        return;
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
          return;
        }
      );
    });
  }).catch(err => {
    res.statusCode = 500;
    res.json({
      code: 500,
      messgae: `操作失败`,
      result: null,
      success: false
    });
  });
});

app.post('/mergeFile', (req, res) => {
  const pipeStream = (path, writeStream) => {
    new Promise(resolve => {
      const readStream = fse.createReadStream(path);
      readStream.on('end', () => {
        fse.unlinkSync(path);
        resolve();
      });
      readStream.pipe(writeStream);
    });
  };

  new Promise((resolve, reject) => {
    fse.readdir(path.resolve(UPLOAD_DIR, req.body.fileHash), (err, files) => {
      if (err) {
        reject(err);
      } else {
        files.sort((a, b) => a - b);
        let fileChunkList = [];
        files.forEach(v => {
          if (!v.startsWith('.')) {
            fileChunkList.push(path.resolve(UPLOAD_DIR, req.body.fileHash, v));
          }
        });
        Promise.all(
          fileChunkList.map((chunkPath, index) => {
            pipeStream(
              chunkPath,
              fse.createWriteStream(
                path.resolve(UPLOAD_DIR, req.body.fileHash, req.body.fileName),
                {
                  start: index * req.body.chunkSize,
                  end: (index + 1) * req.body.chunkSize
                }
              )
            );
          })
        ).then(() => {
          res.json({
            code: 200,
            messgae: '操作成功',
            result: path.join(req.body.fileHash, req.body.fileName),
            success: false
          });
        });
      }
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

app.post('/upload', (req, res) => {
  new Promise((resolve, reject) => {
    const multiparty = new multi.Form();

    multiparty.parse(req, (err, fields, files) => {
      if (err) {
        return reject(err);
      }

      // 将文件移动到最终目录
      fse.move(
        files.file[0].path,
        path.resolve(
          UPLOAD_DIR,
          fields.fileHash[0],
          files.file[0].originalFilename
        ),
        err => {
          if (err) {
            return reject(err);
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

app.listen(port, () => console.log(`正在监听 ${port} 端口`));
