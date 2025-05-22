'use client';

import React, { useEffect, useState } from 'react';
import { getConversionStatus, StatusResponse } from '@/lib/api';
import ProcessingResults from '@/components/ProcessingResults';
import ProgressBar from '@/components/ui/ProgressBar';
import Link from 'next/link';
import { FiArrowLeft, FiCheck, FiLoader, FiX } from 'react-icons/fi';
import { useParams } from 'next/navigation';

export default function ResultsPage() {
  // Use the Next.js useParams hook to get the UUID
  const params = useParams();
  const uuid = params?.uuid as string;
  
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  
  useEffect(() => {
    const fetchStatus = async () => {
      if (!uuid) return;
      
      try {
        setLoading(true);
        const response = await getConversionStatus(uuid);
        console.log('Results page status:', response);
        console.log('Results data available:', !!response.result);
        
        // Debug poster image specifically
        if (response.result) {
          console.log('Poster image in result:', response.result.posterImage);
          if (response.result.posterImage) {
            console.log('Poster URL:', response.result.posterImage.url);
          }
        }
        
        if (response.result) {
          console.log('Compressed file:', response.result.compressedFile);
          console.log('Converted files:', response.result.convertedFiles);
        }
        setStatus(response);
        
        // If still processing, keep polling
        if (response.status === 'pending' || response.status === 'processing') {
          setTimeout(fetchStatus, 2000);
        }
      } catch (error) {
        console.error('Error fetching status:', error);
        setError('Failed to load processing results');
      } finally {
        setLoading(false);
      }
    };
    
    fetchStatus();
  }, [uuid]);
  
  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-6 md:p-8 text-black">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl md:text-3xl font-bold text-black">Processing Results</h1>
            <Link href="/" className="text-blue-500 hover:text-blue-700 flex items-center gap-1">
              <FiArrowLeft /> Back to Upload
            </Link>
          </div>
          
          {loading && !status && (
            <div className="flex justify-center items-center h-40">
              <FiLoader className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          )}
          
          {error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg">
              {error}
            </div>
          )}
          
          {status && (
            <div className="space-y-6">
              <div className="rounded-lg border p-4">
                <h2 className="text-lg font-medium mb-2 text-black">Processing Status</h2>
                
                <div className="space-y-3">
                  {status.status === 'pending' && (
                    <div className="flex items-center gap-2 text-yellow-500">
                      <FiLoader className="animate-spin" />
                      <span className="font-medium">Pending...</span>
                    </div>
                  )}
                  
                  {status.status === 'processing' && (
                    <>
                      <div className="flex items-center gap-2 text-blue-500">
                        <FiLoader className="animate-spin" />
                        <span className="font-medium">Processing ({status.progress || 0}%)</span>
                      </div>
                      <ProgressBar value={status.progress || 0} />
                    </>
                  )}
                  
                  {status.status === 'completed' && (
                    <div className="flex items-center gap-2 text-green-500">
                      <FiCheck />
                      <span className="font-medium">Completed Successfully</span>
                    </div>
                  )}
                  
                  {status.status === 'failed' && (
                    <div className="flex items-center gap-2 text-red-500">
                      <FiX />
                      <span className="font-medium">Processing Failed</span>
                    </div>
                  )}
                </div>
              </div>
              
              {status.status === 'failed' && status.error && (
                <div className="p-4 bg-red-50 text-red-700 rounded-lg">
                  {status.error}
                </div>
              )}
              
              {status.status === 'completed' && (
                <div className="rounded-lg border p-4">
                  <h2 className="text-lg font-medium mb-4 text-black">Download Files</h2>
                  {status.result ? (
                    <ProcessingResults result={status.result} />
                  ) : (
                    <div className="p-4 bg-yellow-50 text-yellow-700 rounded-lg">
                      Processing completed but no files were returned. Please check the console for details.
                    </div>
                  )}
                  
                  <div className="mt-6 pt-4 border-t">
                    <button 
                      onClick={() => setShowDebug(!showDebug)}
                      className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                    >
                      {showDebug ? 'Hide' : 'Show'} Debug Information
                    </button>
                    
                    {showDebug && (
                      <pre className="mt-4 p-3 bg-gray-100 rounded text-xs overflow-auto">
                        {JSON.stringify(status, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
} 