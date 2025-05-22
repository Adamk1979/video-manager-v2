'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import FileUpload from '@/components/FileUpload';
import ProcessingOptions from '@/components/ProcessingOptions';
import ProcessingResults from '@/components/ProcessingResults';
import ProgressBar from '@/components/ui/ProgressBar';
import { uploadVideo, getConversionStatus, ProcessOptions, StatusResponse } from '@/lib/api';
import { FiUpload, FiCheck, FiX, FiLoader } from 'react-icons/fi';

export default function Home() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [statusPolling, setStatusPolling] = useState(false);
  const [options, setOptions] = useState<ProcessOptions>({});
  const [uuid, setUuid] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  
  // Function to handle file selection
  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setStatus(null);
    setUuid(null);
  };
  
  // Function to handle options changes
  const handleOptionsChange = (newOptions: ProcessOptions) => {
    setOptions(newOptions);
  };
  
  // Function to handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFile) {
      toast.error('Please select a file to upload');
      return;
    }
    
    try {
      setProcessing(true);
      
      const response = await uploadVideo(selectedFile, options);
      setUuid(response.uuid);
      setStatusPolling(true);
      
      toast.success('File uploaded successfully');
      
      // Redirect to results page immediately after upload
      router.push(`/results/${response.uuid}`);
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Failed to upload file');
      setProcessing(false);
    }
  };
  
  // Poll for status updates (for showing initial status before redirect)
  useEffect(() => {
    if (!uuid || !statusPolling) return;
    
    const intervalId = setInterval(async () => {
      try {
        const response = await getConversionStatus(uuid);
        console.log('Status response:', response); // Debug log
        setStatus(response);
        
        if (response.status === 'completed' || response.status === 'failed') {
          setStatusPolling(false);
          
          if (response.status === 'completed') {
            console.log('Processing results:', response.result); // Debug log
            toast.success('Processing completed successfully');
            // Navigate to results page
            router.push(`/results/${uuid}`);
          } else {
            toast.error(`Processing failed: ${response.error || 'Unknown error'}`);
          }
        }
      } catch (error) {
        console.error('Error polling status:', error);
        toast.error('Failed to get processing status');
        setStatusPolling(false);
      }
    }, 2000);
    
    return () => clearInterval(intervalId);
  }, [uuid, statusPolling, router]);
  
  // Status display
  const renderStatusIndicator = () => {
    if (!status) return null;
    
    let statusText = '';
    let statusIcon = null;
    let statusColor = '';
    
    switch (status.status) {
      case 'pending':
        statusText = 'Pending...';
        statusIcon = <FiLoader className="animate-spin" />;
        statusColor = 'text-yellow-500';
        break;
      case 'processing':
        statusText = `Processing (${status.progress || 0}%)`;
        statusIcon = <FiLoader className="animate-spin" />;
        statusColor = 'text-blue-500';
        break;
      case 'completed':
        statusText = 'Completed';
        statusIcon = <FiCheck />;
        statusColor = 'text-green-500';
        break;
      case 'failed':
        statusText = 'Failed';
        statusIcon = <FiX />;
        statusColor = 'text-red-500';
        break;
    }
    
    return (
      <div className="mt-6 space-y-3 text-black">
        <div className={`flex items-center gap-2 ${statusColor}`}>
          {statusIcon}
          <span className="font-medium">{statusText}</span>
        </div>
        {status.status === 'processing' && status.progress !== undefined && (
          <ProgressBar value={status.progress} />
        )}
        {status.status === 'completed' && status.result && (
          <ProcessingResults result={status.result} />
        )}
        {status.status === 'failed' && status.error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg">
            {status.error}
          </div>
        )}
      </div>
    );
  };
  
  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-6 md:p-8 text-black">
          <h1 className="text-2xl md:text-3xl font-bold text-center mb-6 text-black">Video Manager</h1>
          
          <form onSubmit={handleSubmit} className="space-y-8">
            <div>
              <h2 className="text-lg font-semibold mb-3 text-black">Upload Video</h2>
              <FileUpload onFileSelect={handleFileSelect} />
            </div>
            
            {selectedFile && (
              <div>
                <h2 className="text-lg font-semibold mb-3 text-black">Processing Options</h2>
                <ProcessingOptions onOptionsChange={handleOptionsChange} />
              </div>
            )}
            
            {selectedFile && (
              <button
                type="submit"
                disabled={processing}
                className={`w-full flex justify-center items-center gap-2 py-3 px-4 rounded-lg text-white font-medium transition-colors ${
                  processing ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {processing ? (
                  <>
                    <FiLoader className="animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <FiUpload />
                    Process Video
                  </>
                )}
              </button>
            )}
          </form>
          
          {renderStatusIndicator()}
        </div>
      </div>
    </main>
  );
}
