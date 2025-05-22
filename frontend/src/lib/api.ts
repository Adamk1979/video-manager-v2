import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'multipart/form-data',
  },
});

export type ConversionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface BackendFile {
  fileName: string;
  size: number;
}

export interface BackendResult {
  convertedFiles?: BackendFile[];
  compressedFile?: {
    fileName: string;
    size: number;
  };
  compressed?: {
    fileName: string;
    fileSize: number;
    link: string;
  };
  files?: any[];
  audioRemovedFile?: {
    fileName: string;
    size?: number;
    fileSize?: number;
    link?: string;
  };
  posterImage?: {
    fileName: string;
  };
  poster?: any;
}

export interface BackendStatusResponse {
  status: ConversionStatus;
  progress?: number;
  result?: BackendResult;
  error?: string;
}

export interface TransformedFile {
  fileName: string;
  size: number;
  url: string;
}

export interface StatusResponse {
  status: ConversionStatus;
  progress?: number;
  result?: {
    convertedFiles?: TransformedFile[];
    compressedFile?: TransformedFile;
    audioRemovedFile?: TransformedFile;
    posterImage?: {
      fileName: string;
      url: string;
    };
  };
  error?: string;
}

export interface ProcessOptions {
  compress?: boolean;
  convert?: boolean;
  removeAudio?: boolean;
  formatType?: string | string[];
  resolution?: string;
  width?: number;
  generatePoster?: boolean;
  posterFormat?: string;
  posterTime?: number;
}

export const uploadVideo = async (file: File, options: ProcessOptions) => {
  const formData = new FormData();
  formData.append('file', file);
  
  // Convert options to query params
  const params = new URLSearchParams();
  
  if (options.compress) params.append('compress', 'true');
  if (options.convert) params.append('convert', 'true');
  if (options.removeAudio) params.append('removeAudio', 'true');
  
  if (options.formatType) {
    if (Array.isArray(options.formatType)) {
      options.formatType.forEach(format => params.append('formatType', format));
    } else {
      params.append('formatType', options.formatType);
    }
  }
  
  if (options.resolution) params.append('resolution', options.resolution);
  if (options.width) params.append('width', options.width.toString());
  
  if (options.generatePoster) {
    params.append('generatePoster', 'true');
    if (options.posterFormat) params.append('posterFormat', options.posterFormat);
    if (options.posterTime) params.append('posterTime', options.posterTime.toString());
  }
  
  const response = await api.post(`/process?${params.toString()}`, formData);
  return response.data;
};

export const getConversionStatus = async (uuid: string): Promise<StatusResponse> => {
  try {
    console.log('Requesting status for UUID:', uuid);
    const response = await api.get<any>(`/status/${uuid}`);
    console.log('Raw backend response:', response.data);
    const backendData = response.data;
    
    // Transform the response to include full URLs
    const transformedResponse: StatusResponse = {
      status: backendData.status,
      progress: backendData.progress || 0,
      error: backendData.error,
      result: {} // Initialize the result object
    };
    
    // Fix for status sometimes getting stuck as "processing"
    if (backendData.progress === 100 && transformedResponse.status === 'processing') {
      transformedResponse.status = 'completed';
    }
    
    // Handle audioRemovedFile at the top level
    if (backendData.audioRemovedFile) {
      console.log('Found audio removed file at top level:', backendData.audioRemovedFile);
      transformedResponse.result = transformedResponse.result || {};
      transformedResponse.result.audioRemovedFile = {
        fileName: backendData.audioRemovedFile.fileName,
        size: backendData.audioRemovedFile.fileSize || backendData.audioRemovedFile.size || 0,
        url: backendData.audioRemovedFile.link || getVideoUrl(backendData.audioRemovedFile.fileName)
      };
      console.log('Added audio removed file to result:', transformedResponse.result.audioRemovedFile);
    }
    
    // Handle compressed file directly from the top level (based on console output)
    if (backendData.compressed) {
      console.log('Found compressed file at top level:', backendData.compressed);
      transformedResponse.result = transformedResponse.result || {};
      transformedResponse.result.compressedFile = {
        fileName: backendData.compressed.fileName,
        size: backendData.compressed.fileSize || 0,
        url: backendData.compressed.link
      };
      console.log('Added compressed file to result:', transformedResponse.result.compressedFile);
    }
    
    // Handle poster image at the top level
    if (backendData.poster) {
      console.log('Found poster image at top level:', backendData.poster);
      transformedResponse.result = transformedResponse.result || {};
      transformedResponse.result.posterImage = {
        fileName: backendData.poster.fileName,
        url: backendData.poster.link
      };
      console.log('Added poster image to result:', transformedResponse.result.posterImage);
    }
    
    // Handle any files array at the top level
    if (backendData.files && Array.isArray(backendData.files) && backendData.files.length > 0) {
      console.log('Found files array at top level:', backendData.files);
      transformedResponse.result = transformedResponse.result || {};
      
      // Process files array into convertedFiles format
      try {
        transformedResponse.result.convertedFiles = backendData.files
          .filter(file => file && (file.fileName || file.name))
          .map(file => ({
            fileName: file.fileName || file.name,
            size: file.fileSize || file.size || 0,
            url: file.link || getVideoUrl(file.fileName || file.name)
          }));
        console.log('Converted top-level files array:', transformedResponse.result.convertedFiles);
      } catch (error) {
        console.error('Error processing files array:', error);
      }
    }
    
    // For nested result handling
    if (backendData.result) {
      if (!transformedResponse.result) {
        transformedResponse.result = {};
      }
      
      try {
        // Handle different possible formats for converted files
        let convertedFilesData = backendData.result.convertedFiles;
        
        // If result is a string (JSON), try to parse it
        if (typeof backendData.result === 'string') {
          try {
            const parsedResult = JSON.parse(backendData.result);
            convertedFilesData = parsedResult.convertedFiles;
            console.log('Parsed result string:', parsedResult);
          } catch (e) {
            console.error('Failed to parse result string:', e);
          }
        }
        
        // Transform converted files if they exist
        if (convertedFilesData && Array.isArray(convertedFilesData) && convertedFilesData.length > 0) {
          console.log('Converting files from backend:', convertedFilesData);
          transformedResponse.result.convertedFiles = convertedFilesData.map(file => ({
            fileName: file.fileName || file.name || `file-${Math.random().toString(36).substring(7)}`,
            size: file.size || 0,
            url: getVideoUrl(file.fileName || file.name)
          }));
          console.log('Transformed converted files:', transformedResponse.result.convertedFiles);
        }
        
        // Transform compressed file if it exists (check both "compressedFile" and "compressed")
        const compressedFileData = backendData.result.compressedFile || backendData.result.compressed;
        if (compressedFileData && !transformedResponse.result.compressedFile) {
          console.log('Converting compressed file from backend.result:', compressedFileData);
          transformedResponse.result.compressedFile = {
            fileName: compressedFileData.fileName || compressedFileData.name || 'compressed-file',
            size: compressedFileData.fileSize || compressedFileData.size || 0,
            url: compressedFileData.link || getVideoUrl(compressedFileData.fileName || compressedFileData.name)
          };
          console.log('Transformed compressed file:', transformedResponse.result.compressedFile);
        }
        
        // Transform audioRemovedFile if it exists in the result object
        if (backendData.result.audioRemovedFile && !transformedResponse.result.audioRemovedFile) {
          console.log('Converting audio removed file from backend.result:', backendData.result.audioRemovedFile);
          const audioRemovedData = backendData.result.audioRemovedFile;
          transformedResponse.result.audioRemovedFile = {
            fileName: audioRemovedData.fileName || audioRemovedData.name || 'audio-removed-file',
            size: audioRemovedData.fileSize || audioRemovedData.size || 0,
            url: audioRemovedData.link || getVideoUrl(audioRemovedData.fileName || audioRemovedData.name)
          };
          console.log('Transformed audio removed file:', transformedResponse.result.audioRemovedFile);
        }
        
        // Transform poster image if it exists
        if (backendData.result.posterImage) {
          console.log('Converting poster image from backend:', backendData.result.posterImage);
          const posterImageData = backendData.result.posterImage;
          transformedResponse.result.posterImage = {
            fileName: posterImageData.fileName || posterImageData.name || 'poster-image',
            url: getVideoUrl(posterImageData.fileName || posterImageData.name)
          };
          console.log('Transformed poster image:', transformedResponse.result.posterImage);
        }
      } catch (error) {
        console.error('Error processing result data:', error);
      }
    }
    
    console.log('Final transformed response:', transformedResponse);
    return transformedResponse;
  } catch (error) {
    console.error('Error fetching conversion status:', error);
    throw error;
  }
};

export const getVideoUrl = (fileName: string) => {
  return `${API_URL}/view/${fileName}`;
};

export default api; 