import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import * as Checkbox from '@radix-ui/react-checkbox';
import { ProcessOptions } from '@/lib/api';
import { FiCheck } from 'react-icons/fi';

interface ProcessingOptionsProps {
  onOptionsChange: (options: ProcessOptions) => void;
}

const ProcessingOptions: React.FC<ProcessingOptionsProps> = ({ onOptionsChange }) => {
  const [showCompressOptions, setShowCompressOptions] = useState(false);
  const [showConvertOptions, setShowConvertOptions] = useState(false);
  const [showPosterOptions, setShowPosterOptions] = useState(false);
  const [customResolution, setCustomResolution] = useState(false);
  
  const { control, watch } = useForm<ProcessOptions>({
    defaultValues: {
      compress: false,
      convert: false,
      removeAudio: false,
      resolution: '720p',
      formatType: ['mp4'],
      generatePoster: false,
      posterFormat: 'png',
      posterTime: 1
    }
  });
  
  // Watch for changes to update UI and send to parent
  React.useEffect(() => {
    const subscription = watch((value) => {
      onOptionsChange(value as ProcessOptions);
    });
    return () => subscription.unsubscribe();
  }, [watch, onOptionsChange]);
  
  return (
    <div className="space-y-6 text-black">
      <div className="flex items-center space-x-2">
        <Controller
          name="removeAudio"
          control={control}
          render={({ field }) => (
            <Checkbox.Root
              className="flex h-5 w-5 items-center justify-center rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              checked={field.value}
              onCheckedChange={field.onChange}
              id="removeAudio"
            >
              {field.value && (
                <Checkbox.Indicator>
                  <FiCheck className="h-4 w-4 text-blue-500" />
                </Checkbox.Indicator>
              )}
            </Checkbox.Root>
          )}
        />
        <label htmlFor="removeAudio" className="text-sm font-medium text-black">
          Remove Audio
        </label>
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Controller
            name="compress"
            control={control}
            render={({ field }) => (
              <Checkbox.Root
                className="flex h-5 w-5 items-center justify-center rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                  setShowCompressOptions(!!checked);
                }}
                id="compress"
              >
                {field.value && (
                  <Checkbox.Indicator>
                    <FiCheck className="h-4 w-4 text-blue-500" />
                  </Checkbox.Indicator>
                )}
              </Checkbox.Root>
            )}
          />
          <label htmlFor="compress" className="text-sm font-medium text-black">
            Compress Video
          </label>
        </div>
        
        {showCompressOptions && (
          <div className="ml-7 space-y-4">
            <div>
              <label htmlFor="resolution" className="block text-sm font-medium mb-1 text-black">
                Resolution
              </label>
              <Controller
                name="resolution"
                control={control}
                render={({ field }) => (
                  <select
                    id="resolution"
                    className="w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                    value={field.value}
                    onChange={(e) => {
                      field.onChange(e.target.value);
                      setCustomResolution(e.target.value === 'custom');
                    }}
                  >
                    <option value="1080p">1080p</option>
                    <option value="720p">720p</option>
                    <option value="480p">480p</option>
                    <option value="custom">Custom</option>
                  </select>
                )}
              />
            </div>
            
            {customResolution && (
              <div>
                <label htmlFor="width" className="block text-sm font-medium mb-1 text-black">
                  Custom Width (pixels)
                </label>
                <Controller
                  name="width"
                  control={control}
                  render={({ field }) => (
                    <input
                      type="number"
                      id="width"
                      className="w-full rounded-md border border-gray-300 py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                      min={1}
                      {...field}
                      value={field.value || ''}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                    />
                  )}
                />
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Controller
            name="convert"
            control={control}
            render={({ field }) => (
              <Checkbox.Root
                className="flex h-5 w-5 items-center justify-center rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                  setShowConvertOptions(!!checked);
                }}
                id="convert"
              >
                {field.value && (
                  <Checkbox.Indicator>
                    <FiCheck className="h-4 w-4 text-blue-500" />
                  </Checkbox.Indicator>
                )}
              </Checkbox.Root>
            )}
          />
          <label htmlFor="convert" className="text-sm font-medium text-black">
            Convert Format
          </label>
        </div>
        
        {showConvertOptions && (
          <div className="ml-7">
            <label htmlFor="formatType" className="block text-sm font-medium mb-1 text-black">
              Select Format(s)
            </label>
            <Controller
              name="formatType"
              control={control}
              render={({ field }) => (
                <select
                  id="formatType"
                  className="w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                  multiple
                  value={Array.isArray(field.value) ? field.value : field.value ? [field.value] : []}
                  onChange={(e) => {
                    const values = Array.from(e.target.selectedOptions).map(option => option.value);
                    field.onChange(values);
                  }}
                >
                  <option value="mp4">MP4</option>
                  <option value="webm">WebM</option>
                  <option value="mov">MOV</option>
                  <option value="avi">AVI</option>
                </select>
              )}
            />
            <p className="text-xs text-black mt-1">Hold Ctrl/Cmd to select multiple</p>
          </div>
        )}
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Controller
            name="generatePoster"
            control={control}
            render={({ field }) => (
              <Checkbox.Root
                className="flex h-5 w-5 items-center justify-center rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                  setShowPosterOptions(!!checked);
                }}
                id="generatePoster"
              >
                {field.value && (
                  <Checkbox.Indicator>
                    <FiCheck className="h-4 w-4 text-blue-500" />
                  </Checkbox.Indicator>
                )}
              </Checkbox.Root>
            )}
          />
          <label htmlFor="generatePoster" className="text-sm font-medium text-black">
            Generate Poster Image
          </label>
        </div>
        
        {showPosterOptions && (
          <div className="ml-7 space-y-4">
            <div>
              <label htmlFor="posterFormat" className="block text-sm font-medium mb-1 text-black">
                Poster Format
              </label>
              <Controller
                name="posterFormat"
                control={control}
                render={({ field }) => (
                  <select
                    id="posterFormat"
                    className="w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                    {...field}
                  >
                    <option value="png">PNG</option>
                    <option value="jpg">JPG</option>
                  </select>
                )}
              />
            </div>
            
            <div>
              <label htmlFor="posterTime" className="block text-sm font-medium mb-1 text-black">
                Poster Time (seconds)
              </label>
              <Controller
                name="posterTime"
                control={control}
                render={({ field }) => (
                  <input
                    type="number"
                    id="posterTime"
                    className="w-full rounded-md border border-gray-300 py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                    min={0}
                    step={0.1}
                    {...field}
                    value={field.value || 1}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 1)}
                  />
                )}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProcessingOptions; 