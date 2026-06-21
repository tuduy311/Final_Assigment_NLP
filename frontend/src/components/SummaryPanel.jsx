import React from 'react';
import ReactMarkdown from 'react-markdown';
import ActionItemTable from './ActionItemTable';

export const SummaryPanel = ({ summaryResult, handleSeek, userName }) => {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-lg font-semibold mb-2">Summary</h4>
        <div className="markdown-body">
          <ReactMarkdown>{summaryResult.summary}</ReactMarkdown>
        </div>
      </div>
      <div>
        <h4 className="text-lg font-semibold mb-2">Action Items</h4>
        <ActionItemTable 
          items={summaryResult.action_items || []} 
          onSeek={handleSeek} 
          userName={userName} 
        />
      </div>
    </div>
  );
};

export default SummaryPanel;
