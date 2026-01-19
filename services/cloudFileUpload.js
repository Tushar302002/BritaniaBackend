import cloudinary from "./cloudinary.js";

export const uploadImage=async(folder,filePath)=>{
    try{
        return await cloudinary.uploader.upload(filePath,{folder});
    }
    catch(err){
        return {err}
    }
}