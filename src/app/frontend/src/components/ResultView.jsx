import React, { useState } from 'react'
import { Copy, ChevronDown, ChevronUp } from 'lucide-react'
import ActionItemTable from './ActionItemTable'

export const ResultView = ({ data, onReset }) => {
  const [expandedSections, setExpandedSections] = useState({
    transcript: false,
    summary: true,
    decisions: true,
    actionItems: true,
  })

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
  }

  const Section = ({ title, content, sectionKey, children }) => (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => toggleSection(sectionKey)}
        className="w-full px-6 py-4 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors group"
      >
        <h3 className="font-semibold text-gray-900 text-lg">{title}</h3>
        {expandedSections[sectionKey] ? (
          <ChevronUp className="w-5 h-5 text-gray-600" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-600" />
        )}
      </button>

      {expandedSections[sectionKey] && (
        <div className="px-6 py-4 bg-white border-t border-gray-200">
          {children || (
            <div className="relative">
              <p className="text-gray-700 whitespace-pre-wrap">{content}</p>
              {content && (
                <button
                  onClick={() => copyToClipboard(content)}
                  className="absolute top-0 right-0 p-2 text-gray-500 hover:text-gray-700 transition-colors"
                  title="Copy to clipboard"
                >
                  <Copy className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Meeting Results</h2>
        <p className="text-gray-600">Analysis complete. Review the extracted information below.</p>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {/* Summary */}
        <Section title="Summary" content={data.summary} sectionKey="summary" />

        {/* Key Decisions */}
        <Section title="Key Decisions" sectionKey="decisions">
          {data.decisions && data.decisions.length > 0 ? (
            <ul className="space-y-3">
              {data.decisions.map((decision, index) => (
                <li key={index} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-semibold">
                    {index + 1}
                  </span>
                  <span className="text-gray-700 pt-0.5">{decision}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No decisions found</p>
          )}
        </Section>

        {/* Action Items */}
        <Section title="Action Items" sectionKey="actionItems">
          <ActionItemTable items={data.action_items} />
        </Section>

        {/* Transcript */}
        <Section title="Full Transcript" content={data.transcript} sectionKey="transcript" />
      </div>

      {/* Action Buttons */}
      <div className="mt-8 flex gap-3 justify-center">
        <button
          onClick={onReset}
          className="px-6 py-2 bg-gray-200 text-gray-900 font-medium rounded-lg hover:bg-gray-300 transition-colors"
        >
          Process Another Meeting
        </button>
        <button
          onClick={() => {
            const allText = `
SUMMARY
${data.summary}

KEY DECISIONS
${data.decisions?.join('\n') || 'None'}

ACTION ITEMS
${data.action_items?.map((item) => {
              const dl = item.deadline;
              const deadlineStr = typeof dl === 'object' && dl ? (dl.resolved || dl.raw_phrase || '') : (dl || '');
              return `- ${item.title || item.task} (Owner: ${item.assignees ? item.assignees.join(', ') : (item.owner || 'N/A')}, Deadline: ${deadlineStr || 'N/A'})`;
            }).join('\n') || 'None'}

TRANSCRIPT
${data.transcript}
            `.trim()
            copyToClipboard(allText)
          }}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Copy className="w-4 h-4" />
          Copy All
        </button>
      </div>
    </div>
  )
}

export default ResultView
