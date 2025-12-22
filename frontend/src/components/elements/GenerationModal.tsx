import React, { useState, useEffect } from 'react';
import './GenerationModal.css';
import { getCompiledMasterPrompt, generateElementMaster } from '../../services/elements';
import type { CompiledPrompt } from '../../services/elements';

interface GenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  assetId: string;
  assetName: string;
  assetType: 'character' | 'location' | 'prop';
  onSuccess: (masterId: string) => void;
}

export const GenerationModal: React.FC<GenerationModalProps> = ({
  isOpen,
  onClose,
  projectId,
  assetId,
  assetName,
  assetType,
  onSuccess,
}) => {
  const [compiledPrompt, setCompiledPrompt] = useState<CompiledPrompt | null>(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [model, setModel] = useState('gemini-3-pro-image');
  const [resolution, setResolution] = useState('2048x2048');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  // Load compiled prompt when modal opens
  useEffect(() => {
    if (isOpen && projectId && assetId) {
      setLoading(true);
      setError('');

      getCompiledMasterPrompt(projectId, assetId)
        .then((prompt) => {
          setCompiledPrompt(prompt);
          setEditedPrompt(prompt.prompt);
          setModel(prompt.model || 'gemini-3-pro-image');
          setResolution(prompt.resolution || '2048x2048');
        })
        .catch((err) => {
          setError('Failed to load prompt: ' + err.message);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, projectId, assetId]);

  const handleGenerate = async () => {
    if (!editedPrompt.trim()) {
      setError('Prompt cannot be empty');
      return;
    }

    setGenerating(true);
    setError('');

    try {
      const result = await generateElementMaster(projectId, {
        asset_id: assetId,
        prompt: editedPrompt,
        auto_generate: false,
        model,
        resolution,
      });

      if (result.success) {
        onSuccess(result.master_id);
        onClose();
      } else {
        setError('Generation failed');
      }
    } catch (err: any) {
      setError('Generation error: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  if (!isOpen) return null;

  const getTypeIcon = () => {
    switch (assetType) {
      case 'character': return '👤';
      case 'location': return '📍';
      case 'prop': return '🔧';
      default: return '⭐';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content generation-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {getTypeIcon()} Generate Master - {assetName}
          </h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {loading && (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading prompt template...</p>
            </div>
          )}

          {error && (
            <div className="error-banner">
              ⚠️ {error}
            </div>
          )}

          {!loading && compiledPrompt && (
            <>
              <div className="form-section">
                <label>Prompt</label>
                <textarea
                  value={editedPrompt}
                  onChange={(e) => setEditedPrompt(e.target.value)}
                  rows={12}
                  className="prompt-editor"
                  placeholder="Enter generation prompt..."
                />
                <p className="help-text">
                  This prompt will be sent to the AI image generator. Edit as needed.
                </p>
              </div>

              <div className="form-row">
                <div className="form-section">
                  <label>Model</label>
                  <select value={model} onChange={(e) => setModel(e.target.value)}>
                    <option value="gemini-3-pro-image">Gemini 3 Pro Image (Nano Banana Pro)</option>
                    <option value="gemini-2.5-flash-image">Gemini 2.5 Flash (Nano Banana)</option>
                  </select>
                  <p className="help-text">Pro = highest quality, Flash = faster</p>
                </div>

                <div className="form-section">
                  <label>Resolution</label>
                  <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
                    <option value="1024x1024">1024×1024</option>
                    <option value="2048x2048">2048×2048 (Recommended)</option>
                    <option value="2048x1365">2048×1365 (3:2 Landscape)</option>
                  </select>
                </div>
              </div>

              <div className="generation-info">
                <div className="info-item">
                  <span className="info-label">Type:</span>
                  <span className="info-value">{assetType}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Background:</span>
                  <span className="info-value">{compiledPrompt.background}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Cost:</span>
                  <span className="info-value">~$0.04</span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={generating}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={loading || generating || !editedPrompt.trim()}
          >
            {generating ? (
              <>
                <span className="spinner-small"></span>
                Generating...
              </>
            ) : (
              'Generate Master'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
