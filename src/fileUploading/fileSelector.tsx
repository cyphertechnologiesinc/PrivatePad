import { launchImageLibrary } from 'react-native-image-picker';


export const pickMedia = async (): Promise<any> => {
  try {
    const response = await launchImageLibrary({
      mediaType: 'mixed', // Allow both images and videos
      includeBase64: false, // Include base64 data if needed
      maxHeight: 800, // Optional: Resize height
      quality: 0.8, // Optional: Set image quality
    });

    if (response.didCancel) {
      console.log('User canceled the picker');
    } else if (response.errorCode) {
      console.error('ImagePicker Error: ', response.errorCode);
    } else {
      // Return the response object directly (including the assets, etc.)
 
      return response;
    }
  } catch (error) {
    console.error('Error launching image library: ', error);
  }
};

/*

Usage: 


// Assuming you have a function that will handle the media after it's picked

const handlePickedMedia = (media) => {
  console.log('Picked media:', media);
  // Now you can call the function to upload this media to S3
};

pickMedia(handlePickedMedia);

*/
