import fs from 'fs'
import process from 'process'
import crypto from 'crypto'
import { connectToDB, FileModel, IDiskFile, preholdHash } from './load_disk_tree_into_mongo'

async function calHash(path: string) {
  if (!fs.existsSync(path)) return Promise.reject('not found file')

  var start = new Date().getTime();
  var md5sum = crypto.createHash('md5');
  var stream = fs.createReadStream(path);

  return new Promise<string>((resolve, reject) => {
    stream.on("error", function(err){
      reject(err.message)
    })

    stream.on('data', function (chunk) {
      md5sum.update(chunk);
    })

    stream.on('end', function () {
      const str = md5sum.digest('hex').toUpperCase();
      console.log('文件:' + path + ',MD5签名为:' + str + '.耗时:' + (new Date().getTime() - start) / 1000.00 + "秒");
      resolve(str)
    })

  })
}


async function main() {
  await connectToDB()
  // return await FileModel.countDocuments()
  const queryList = await FileModel.find()

  for (let i = 0, fileRecord: IDiskFile; i < queryList.length, fileRecord = queryList[i]; i++) {
    console.log(fileRecord.unixPath)
    if (fileRecord.fileHash!==preholdHash) continue;  // 已经计算过hash的跳过
    try {
      fileRecord.fileHash = await calHash(fileRecord.unixPath)
    } catch (err) {
      console.error('hash file error:', fileRecord.unixPath, err)
    }
    try {
      const res = await FileModel.updateOne({_id: fileRecord._id, }, {fileHash: fileRecord.fileHash})
      console.log('update success', res)
    }catch(e) {
      console.error('update error', fileRecord.unixPath, e)
    }
  }

}

if (!module.parent) {
  main()
    .then((res) => {
      console.log('main:', res)
    })
    .catch((err) => {
      console.error('err:', err)
    })
    .finally(() => {
      process.exit()
    })
}
