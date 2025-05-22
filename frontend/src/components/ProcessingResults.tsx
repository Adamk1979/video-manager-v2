import React from 'react';
import { StatusResponse } from '@/lib/api';
import { FiDownload, FiImage, FiVideo, FiMusic, FiExternalLink, FiAlertCircle } from 'react-icons/fi';

interface ProcessingResultsProps {
  result: StatusResponse['result'];
  fullWidth?: boolean;
}

const formatSize = (size: number) => {
  if (!size && size !== 0) return 'Unknown size';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
};

const ProcessingResults: React.FC<ProcessingResultsProps> = ({ result, fullWidth = false }) => {
  if (!result) {
    return (
      <div className="p-4 bg-yellow-50 text-yellow-700 rounded-lg">
        <div className="flex items-center gap-2">
          <FiAlertCircle className="text-yellow-500" />
          <span>No processing results available</span>
        </div>
      </div>
    );
  }
  
  console.log('Rendering results:', result); // Debug log
  
  // Get results data safely
  const convertedFiles = Array.isArray(result.convertedFiles) ? result.convertedFiles : [];
  const compressedFile = result.compressedFile || null;
  const audioRemovedFile = result.audioRemovedFile || null;
  const posterImage = result.posterImage || null;
  
  // For URL access, handle both properties
  const getUrl = (file: any) => {
    if (!file) return null;
    return file.url || file.link || null;
  };
  
  // Check if we have any results to show
  const hasResults = 
    (convertedFiles && convertedFiles.length > 0) || 
    (compressedFile && getUrl(compressedFile)) || 
    (audioRemovedFile && getUrl(audioRemovedFile)) ||
    (posterImage && getUrl(posterImage));
  
  // Debug the result structure
  console.log('Has results:', hasResults);
  console.log('Compressed file available:', !!compressedFile);
  console.log('Audio removed file available:', !!audioRemovedFile);
  console.log('Poster image available:', !!posterImage);
  
  if (audioRemovedFile) {
    console.log('Audio removed file URL:', getUrl(audioRemovedFile));
    console.log('Audio removed file name:', audioRemovedFile.fileName);
  }
  
  if (!hasResults) {
    return (
      <div className="p-4 bg-yellow-50 text-yellow-700 rounded-lg">
        <div className="flex items-center gap-2">
          <FiAlertCircle className="text-yellow-500" />
          <span>
            {compressedFile === null && audioRemovedFile === null ? 
              "The server processed your request but couldn't generate any output files. This could be due to an issue with the source video or server limitations." :
              "Processing completed, but no files were generated. Please check your processing options and try again."}
          </span>
        </div>
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <details>
            <summary className="cursor-pointer font-medium">View technical details</summary>
            <div className="mt-2 text-xs overflow-x-auto">
              <p className="mb-2">This information may help in diagnosing the issue:</p>
              <div className="space-y-1">
                <p><b>Compressed file:</b> {compressedFile === null ? 'null' : compressedFile === undefined ? 'undefined' : 'object'}</p>
                <p><b>Audio removed file:</b> {audioRemovedFile === null ? 'null' : audioRemovedFile === undefined ? 'undefined' : 'object'}</p>
                <p><b>Converted files:</b> {convertedFiles.length ? `${convertedFiles.length} files` : 'none'}</p>
                <p><b>Poster image:</b> {posterImage === null ? 'null' : posterImage === undefined ? 'undefined' : 'object'}</p>
              </div>
              <hr className="my-2" />
              <p className="mb-1">Full result data:</p>
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </div>
          </details>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`space-y-6 text-black ${fullWidth ? 'w-full' : ''}`}>
      {/* Compressed File Section */}
      {compressedFile && getUrl(compressedFile) && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 p-4 border-b">
            <h3 className="font-medium text-lg flex items-center gap-2">
              <FiVideo className="text-blue-500" />
              Compressed Video
            </h3>
          </div>
          <div className="p-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <p className="font-medium text-black mb-1">{compressedFile.fileName || 'compressed-file'}</p>
                <p className="text-sm text-black">{formatSize(compressedFile.size)}</p>
                <p className="text-xs text-gray-500 mt-1 break-all">URL: {getUrl(compressedFile)}</p>
              </div>
              <div className="flex gap-3">
                <a
                  href={getUrl(compressedFile)}
                  download
                  className="flex items-center gap-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                >
                  <FiDownload /> Download
                </a>
                <a
                  href={getUrl(compressedFile)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 transition-colors"
                >
                  <FiExternalLink /> View
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Audio Removed File Section */}
      {audioRemovedFile && getUrl(audioRemovedFile) && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 p-4 border-b">
            <h3 className="font-medium text-lg flex items-center gap-2">
              <FiMusic className="text-blue-500" />
              Video with Audio Removed
            </h3>
          </div>
          <div className="p-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <p className="font-medium text-black mb-1">{audioRemovedFile.fileName || 'audio-removed-file'}</p>
                <p className="text-sm text-black">{formatSize(audioRemovedFile.size)}</p>
                <p className="text-xs text-gray-500 mt-1 break-all">URL: {getUrl(audioRemovedFile)}</p>
              </div>
              <div className="flex gap-3">
                <a
                  href={getUrl(audioRemovedFile)}
                  download
                  className="flex items-center gap-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                >
                  <FiDownload /> Download
                </a>
                <a
                  href={getUrl(audioRemovedFile)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 transition-colors"
                >
                  <FiExternalLink /> View
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Converted Files Section */}
      {convertedFiles.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 p-4 border-b">
            <h3 className="font-medium text-lg flex items-center gap-2">
              <FiVideo className="text-blue-500" />
              Converted Files
            </h3>
          </div>
          <div className="divide-y">
            {convertedFiles.filter(file => file && getUrl(file)).map((file, index) => (
              <div key={index} className="p-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <p className="font-medium text-black mb-1">{file.fileName || `converted-file-${index + 1}`}</p>
                    <p className="text-sm text-black">{formatSize(file.size)}</p>
                    <p className="text-xs text-gray-500 mt-1 break-all">URL: {getUrl(file)}</p>
                  </div>
                  <div className="flex gap-3">
                    <a
                      href={getUrl(file)}
                      download
                      className="flex items-center gap-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                    >
                      <FiDownload /> Download
                    </a>
                    <a
                      href={getUrl(file)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 transition-colors"
                    >
                      <FiExternalLink /> View
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Poster Image Section (When URL is available) */}
      {posterImage && getUrl(posterImage) && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 p-4 border-b">
            <h3 className="font-medium text-lg flex items-center gap-2">
              <FiImage className="text-blue-500" />
              Poster Image
            </h3>
          </div>
          <div className="p-4">
            <div className="mb-4">
              <img 
                src={getUrl(posterImage)} 
                alt="Poster" 
                className="w-full rounded-lg max-h-48 object-contain bg-gray-100 p-2"
              />
            </div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <p className="font-medium text-black">{posterImage.fileName || 'poster-image'}</p>
                <p className="text-xs text-gray-500 mt-1 break-all">URL: {getUrl(posterImage)}</p>
              </div>
              <div className="flex gap-3">
                <a
                  href={getUrl(posterImage)}
                  download
                  className="flex items-center gap-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                >
                  <FiDownload /> Download
                </a>
                <a
                  href={getUrl(posterImage)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 transition-colors"
                >
                  <FiExternalLink /> View
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Poster Image Section (Alternative display if URL is not available) */}
      {posterImage && !getUrl(posterImage) && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 p-4 border-b">
            <h3 className="font-medium text-lg flex items-center gap-2">
              <FiImage className="text-blue-500" />
              Poster Image (No URL)
            </h3>
          </div>
          <div className="p-4">
            <div className="flex flex-col gap-3">
              <div className="bg-gray-100 p-4 rounded-lg flex items-center justify-center min-h-32">
                <div className="text-gray-400 flex flex-col items-center gap-2">
                  <FiImage className="w-8 h-8" />
                  <p>Poster image created but URL not available</p>
                </div>
              </div>
              <div>
                <p className="font-medium text-black mb-1">{posterImage.fileName || 'poster-image'}</p>
                <div className="mt-2 p-3 bg-gray-50 rounded text-xs break-all">
                  <p className="font-medium mb-1">Poster image data:</p>
                  <pre>{JSON.stringify(posterImage, null, 2)}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcessingResults; 