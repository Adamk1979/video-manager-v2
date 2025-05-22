import React from 'react';
import * as Progress from '@radix-ui/react-progress';

interface ProgressBarProps {
  value: number;
  className?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ value, className }) => {
  return (
    <Progress.Root
      className={`relative overflow-hidden bg-gray-200 rounded-full w-full h-4 ${className}`}
      style={{ transform: 'translateZ(0)' }}
      value={value}
    >
      <Progress.Indicator
        className="bg-blue-500 w-full h-full transition-transform duration-300 ease-in-out"
        style={{ transform: `translateX(-${100 - value}%)` }}
      />
    </Progress.Root>
  );
};

export default ProgressBar; 