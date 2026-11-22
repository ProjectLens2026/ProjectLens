export async function imageData(file:File){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12000000)throw Error('Choose a PNG, JPEG or WebP image under 12 MB.')
 const url=URL.createObjectURL(file)
 try{const im=new Image();im.src=url;await im.decode();const scale=Math.min(1,2400/im.width,2400/im.height),canvas=document.createElement('canvas');canvas.width=Math.round(im.width*scale);canvas.height=Math.round(im.height*scale);const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image processing unavailable.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(im,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',.88);if(data.length>3000000)throw Error('Screenshot is too large. Crop it or use a smaller image.');return data}finally{URL.revokeObjectURL(url)}
}
