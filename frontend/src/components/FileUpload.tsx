import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FiUpload, FiFile } from 'react-icons/fi';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: Record<string, string[]>;
  maxSize?: number;
}

const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelect,
  accept = {
    'video/*': []
  },
  maxSize = 1024 * 1024 * 1024 // 1GB
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length) {
      const selectedFile = acceptedFiles[0];
      setFile(selectedFile);
      onFileSelect(selectedFile);
      
      // Create preview for video
      const objectUrl = URL.createObjectURL(selectedFile);
      setPreview(objectUrl);
      
      // Cleanup function
      return () => URL.revokeObjectURL(objectUrl);
    }
  }, [onFileSelect]);
  
  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept,
    maxSize,
    multiple: false
  });
  
  const fileSize = file ? (file.size / (1024 * 1024)).toFixed(2) + ' MB' : '';
  
  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
        }`}
      >
        <input {...getInputProps()} />
        
        {file ? (
          <div className="flex flex-col items-center">
            <FiFile className="w-12 h-12 text-blue-500 mb-3" />
            <p className="font-medium text-black">{file.name}</p>
            <p className="text-sm text-black">{fileSize}</p>
            {preview && (
              <div className="mt-4 w-full max-w-md mx-auto">
                <video 
                  className="w-full rounded" 
                  controls
                  src={preview}
                  onError={() => setPreview(null)}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <FiUpload className="w-12 h-12 text-gray-400 mb-3" />
            <p className="text-lg font-medium text-black">
              {isDragActive ? 'Drop the video here' : 'Drag & drop a video file here'}
            </p>
            <p className="text-sm text-black mt-1">or click to browse files</p>
            <p className="text-xs text-black mt-2">Max size: 1GB</p>
          </div>
        )}
      </div>
      
      {fileRejections.length > 0 && (
        <p className="text-red-500 mt-2">
          {fileRejections[0].errors[0].message}
        </p>
      )}
    </div>
  );
};

export default FileUpload; 