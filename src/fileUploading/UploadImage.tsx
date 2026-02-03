import { RNS3 } from 'react-native-aws3';

/**
 * Function to upload a file (image/video) to an S3 bucket
 * @param {Object} file - The selected file object containing uri, name, and type
 * @param {Function} callback - Callback function to handle the upload response
 */

export const uploadToS3 = (file: any, callback: any) => {
  const fileExtension = file.uri.split('.').pop(); // Get file extension (e.g., jpg, mp4)
  const fileName = `media/${Date.now()}.${fileExtension}`; // Unique filename

  // S3 options
  const options = {
    keyPrefix: 'uploads/', // Prefix path in the bucket
    bucket: process.env.S3BUCKET as string, // Your S3 bucket name
    region: process.env.S3REGION as string, // The region your bucket is hosted in (e.g., 'us-west-2')
    accessKey: process.env.S3ACCESSKEY as string, // Your AWS access key
    secretKey: process.env.S3SECRETKEY as string, // Your AWS secret key
    successActionStatus: 201, // Success status code
  };

  const fileObject = {
    uri: file.uri,
    name: fileName,
    type: file.type, // Use 'video/mp4' for videos or 'image/jpeg' for images
  };

  // Upload file to S3 using react-native-aws3
  RNS3.put(fileObject, options)
    .then((response) => {
      if (response.status === 201) {
        console.log('Upload successful:', (response as any).body); 
        // Return the file URL from S3 response
        const fileUrl = (response as any).body.postResponse.location; 
        callback(fileUrl, null); // Return the S3 file URL in the callback
      } else {
        console.error('Upload failed:', response);
        callback(null, 'Upload failed');
      }
    })
    .catch((error) => {
      console.error('Error uploading to S3:', error);
      callback(null, error.message);
    });
};
