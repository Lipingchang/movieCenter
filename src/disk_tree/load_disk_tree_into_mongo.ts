import fs, { PathLike } from 'fs';
// import mongodb from 'mongodb';
import mongoose from 'mongoose';
import path from 'path';
import process from 'process';

const Schema = mongoose.Schema;
const Model = mongoose.model;

export const driverName = 'seagate5t'		// 全小写 会在collection的名字中出现
export const startPath = "/mnt/f/NSFW" // drive 挂载点
export const preholdHash = 'not set'

/**
 * DiskFolderSchema 保存 文件树
 * DiskFileSchema 保存 文件具体内容
 */

export const DiskFolderSchema = new Schema({
	folderName: { type: String, required: true, },								// 文件夹名字
	unixPath: { type: String, required: true, },									// 文件夹路径
	subDiskFolders: { type: [String], required: true, },					// 子文件夹 _id 列表
	diskFileList: {
		type: [{
			fileName: { type: String, required: true },								// 子文件内容
			fileId: { type: String, required: true },									// 子文件 _id, 详细信息用他查询
		}],
		required: true,
	},
})

export interface IDiskFolder {
	folderName: string;
	unixPath: string;
	subDiskFolders: Array<string>;
	diskFileList: Array<{
		fileName: string;
		fileId: string;
	}>
}

export const DiskFileSchema = new Schema({ 	// 文件详情
	unixPath: { type: String, required: true }, 							  // 路径
	fileName: { type: String, required: true },									// 名字
	fileSize: { type: Number, required: true },									// 大小
	fileHash: { type: String, required: true },									// 文件内容hash
	fileType: { type: String, },									// 文件格式
})

export interface IDiskFile {
	unixPath: string;
	fileName: string;
	fileSize: number;
	fileHash: string;
	fileType: string;
}

export const FolderModel = Model<IDiskFolder & mongoose.Document>(`folder`, DiskFolderSchema, `${driverName.toLowerCase()}_folder`)
export const FileModel = Model<IDiskFile & mongoose.Document>(`file`, DiskFileSchema, `${driverName.toLowerCase()}_file`)

export async function connectToDB() {
	mongoose.connect("mongodb://localhost:27017/MovieArrange", { useNewUrlParser: true, useUnifiedTopology: true })
	const connection = mongoose.connection;
	connection
		.on('error', (error) => {
			return Promise.reject(error)
		})
		.once('open', function () {
			return Promise.resolve(true)
		})
}

async function main() {
	await connectToDB();
	async function saveFolder(_folder: IDiskFolder) {
		const saveFolder = new FolderModel(_folder)
		await saveFolder.save();
		return saveFolder.get("_id")
	}

	async function saveFile(_file: IDiskFile) {
		const saveFile = new FileModel(_file)
		await saveFile.save()
		return saveFile.get("_id")
	}

	async function scanDiskFileTree(rootPath: PathLike): Promise<string> {
		// 当前文件存在
		if (!fs.existsSync(rootPath)) return Promise.reject();

		const subFileNames = fs.readdirSync(rootPath);
		const subFileIds = []
		const subFolderIds = []

		// 遍历子文件
		for (let i = 0, subFileName; i < subFileNames.length, subFileName = subFileNames[i]; i++) {
			const subFilePath = path.join(rootPath.toString(), subFileName)
			const fileStat = fs.statSync(subFilePath)

			if (fileStat.isDirectory()) {
				subFolderIds.push(await scanDiskFileTree(subFilePath))
			} else {
				const fileID = await saveFile({
					unixPath: subFilePath,
					fileName: subFileName,
					fileSize: fileStat.size,
					fileHash: preholdHash,
					fileType: path.extname(subFilePath)
				})
				subFileIds.push({
					fileId: fileID,
					fileName: subFileName,
				})
			}
		}

		// 返回 插入的文件夹的 _id
		return await saveFolder({
			diskFileList: subFileIds,
			folderName: path.basename(rootPath.toString()),
			unixPath: rootPath.toString(),
			subDiskFolders: subFolderIds,
		})
	}

	return await scanDiskFileTree(startPath)
}


if (module.parent) {
	console.log('required module')
} else {
	main()
		.then((res) => {
			console.log('root dir _id:', res)
		})
		.catch((err) => {
			console.log(err.message)
		})
		.finally(() => {
			process.exit()
		})
}