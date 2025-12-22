import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import './ElementsNew.css';
import {
  getCompiledMasterPrompt,
  queueMasterGeneration,
  getGenerationRequestStatus,
  listGenerationRequests,
  saveGenerationToSlot,
  cancelGenerationRequest,
  getActiveMasterForAsset
} from '../services/elements';
import { getAssets } from '../api/client';

interface Asset {
  id: string;
  name: string;
  type: string;
  description?: string;
}

interface GenerationRequest {
  id: string;
  status: string;
  progress_percentage: number;
  current_step: string;
  output_image_url: string | null;
  error_message: string | null;
  target_asset_id: string;
  prompt: string;
  model: string;
  params: string;
  created_at: string;
  completed_at: string | null;
  cost_usd: number | null;
  candidate_group_id: string;
  saved_to_master_id: string | null;
}

export default function ElementsNew() {
  const { projectId } = useParams<{ projectId: string }>();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [activeGenerations, setActiveGenerations] = useState<GenerationRequest[]>([]);
  const [completedGenerations, setCompletedGenerations] = useState<GenerationRequest[]>([]);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [generationModel, setGenerationModel] = useState('gemini-3-pro-image');
  const [generationResolution, setGenerationResolution] = useState('2048x2048');
  const [isGenerating, setIsGenerating] = useState(false);
  const [filter, setFilter] = useState('all');
  const [viewingGeneration, setViewingGeneration] = useState<GenerationRequest | null>(null);
  const [activeMasterId, setActiveMasterId] = useState<string | null>(null);

  const pollInterval = useRef<number | undefined>(undefined);

  // Load assets on mount
  useEffect(() => {
    if (projectId) {
      loadAssets();
    }
  }, [projectId]);

  // Poll for active generations
  useEffect(() => {
    if (projectId && activeGenerations.length > 0) {
      pollInterval.current = setInterval(() => {
        updateActiveGenerations();
      }, 1000); // Poll every 1 second for smooth progress

      return () => {
        if (pollInterval.current) {
          clearInterval(pollInterval.current);
        }
      };
    }
  }, [projectId, activeGenerations.length]);

  // Load generations when asset selected
  useEffect(() => {
    if (selectedAsset && projectId) {
      loadGenerationsForAsset(selectedAsset.id);
    }
  }, [selectedAsset, projectId]);

  const loadAssets = async () => {
    try {
      const assetsData = await getAssets(projectId!);
      // getAssets returns { characters, locations, props, frames }
      const allAssets: Asset[] = [
        ...(assetsData.characters || []),
        ...(assetsData.locations || []),
        ...(assetsData.props || [])
      ];
      setAssets(allAssets);

      // Select first asset if none selected
      if (!selectedAsset && allAssets.length > 0) {
        setSelectedAsset(allAssets[0]);
      }
    } catch (error) {
      console.error('Failed to load assets:', error);
    }
  };

  const loadGenerationsForAsset = async (assetId: string) => {
    try {
      // Load generations and active master in parallel
      const [requests, activeMasterData] = await Promise.all([
        listGenerationRequests(projectId!, undefined, assetId),
        getActiveMasterForAsset(projectId!, assetId)
      ]);

      const active = requests.filter((r: GenerationRequest) =>
        ['queued', 'preparing', 'generating', 'downloading'].includes(r.status)
      );
      const completed = requests.filter((r: GenerationRequest) =>
        ['complete', 'failed'].includes(r.status)
      );

      setActiveGenerations(active);
      setCompletedGenerations(completed);

      // Set the active master based on the actual is_active flag in element_masters
      setActiveMasterId(activeMasterData.active_generation_id || null);
    } catch (error) {
      console.error('Failed to load generations:', error);
    }
  };

  const updateActiveGenerations = async () => {
    try {
      const updated = await Promise.all(
        activeGenerations.map(async (gen) => {
          const status = await getGenerationRequestStatus(projectId!, gen.id);
          return status;
        })
      );

      setActiveGenerations(updated.filter((r: GenerationRequest) =>
        ['queued', 'preparing', 'generating', 'downloading'].includes(r.status)
      ));

      // Reload completed list if any finished
      const newlyCompleted = updated.filter((r: GenerationRequest) =>
        ['complete', 'failed'].includes(r.status)
      );

      if (newlyCompleted.length > 0 && selectedAsset) {
        loadGenerationsForAsset(selectedAsset.id);
      }
    } catch (error) {
      console.error('Failed to update generations:', error);
    }
  };

  const handleGenerateClick = async () => {
    if (!selectedAsset) return;

    try {
      // Load compiled prompt
      const promptData = await getCompiledMasterPrompt(projectId!, selectedAsset.id);
      setGenerationPrompt(promptData.prompt);
      setGenerationModel('gemini-3-pro-image');
      setGenerationResolution(promptData.resolution || '2048x2048');
      setShowGenerateModal(true);
    } catch (error) {
      console.error('Failed to load prompt:', error);
    }
  };

  const handleConfirmGenerate = async () => {
    if (!selectedAsset) return;

    setIsGenerating(true);
    try {
      const result = await queueMasterGeneration(projectId!, {
        asset_id: selectedAsset.id,
        prompt: generationPrompt,
        model: generationModel,
        resolution: generationResolution
      });

      setShowGenerateModal(false);
      setIsGenerating(false);

      // Add to active generations
      const newGen = await getGenerationRequestStatus(projectId!, result.request_id);
      setActiveGenerations([...activeGenerations, newGen]);
    } catch (error) {
      console.error('Failed to start generation:', error);
      setIsGenerating(false);
    }
  };

  const handleSaveToSlot = async (requestId: string, makeActive: boolean = false) => {
    try {
      const result = await saveGenerationToSlot(projectId!, requestId, makeActive);
      if (result.success) {
        // Update the active master immediately for instant UI feedback
        setActiveMasterId(requestId);
        if (selectedAsset) {
          loadGenerationsForAsset(selectedAsset.id);
        }
      }
    } catch (error) {
      console.error('Failed to save to slot:', error);
      alert('Failed to set as active. The generation may not be complete yet.');
    }
  };

  const handleCancelGeneration = async (requestId: string) => {
    try {
      await cancelGenerationRequest(projectId!, requestId);
      setActiveGenerations(activeGenerations.filter(g => g.id !== requestId));
    } catch (error) {
      console.error('Failed to cancel generation:', error);
    }
  };

  const getFilteredAssets = () => {
    if (filter === 'all') return assets;
    return assets.filter(a => a.type === filter);
  };

  const getAssetIcon = (type: string) => {
    switch (type) {
      case 'character': return '👤';
      case 'location': return '📍';
      case 'prop': return '🔧';
      default: return '📦';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete': return '#10b981';
      case 'failed': return '#ef4444';
      case 'generating': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  return (
    <div className="elements-new-page">
      {/* Top Panel (25%) - Assets List Full Width */}
      <div className="top-panel">
        <div className="assets-section full-width">
          <div className="assets-header">
            <h2>Elements</h2>
            <div className="filter-buttons">
              <button
                className={filter === 'all' ? 'active' : ''}
                onClick={() => setFilter('all')}
              >
                All ({assets.length})
              </button>
              <button
                className={filter === 'character' ? 'active' : ''}
                onClick={() => setFilter('character')}
              >
                👤 Characters ({assets.filter(a => a.type === 'character').length})
              </button>
              <button
                className={filter === 'location' ? 'active' : ''}
                onClick={() => setFilter('location')}
              >
                📍 Locations ({assets.filter(a => a.type === 'location').length})
              </button>
              <button
                className={filter === 'prop' ? 'active' : ''}
                onClick={() => setFilter('prop')}
              >
                🔧 Props ({assets.filter(a => a.type === 'prop').length})
              </button>
            </div>
          </div>

          <div className="assets-list">
            {getFilteredAssets().map(asset => (
              <div
                key={asset.id}
                className={`asset-card ${selectedAsset?.id === asset.id ? 'selected' : ''}`}
                onClick={() => setSelectedAsset(asset)}
              >
                <div className="asset-icon">{getAssetIcon(asset.type)}</div>
                <div className="asset-info">
                  <h3>{asset.name}</h3>
                  <p>{asset.description?.substring(0, 80)}...</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Panel (70%) */}
      <div className="bottom-panel">
        {selectedAsset ? (
          <>
            <div className="workspace-header">
              <h2>{getAssetIcon(selectedAsset.type)} {selectedAsset.name}</h2>
              <button className="generate-btn" onClick={handleGenerateClick}>
                🔄 Generate New
              </button>
            </div>

            {/* Master Slot */}
            <div className="slot-section">
              <div className="slot-header">
                <h3>Master Slot</h3>
                <span className="slot-info">
                  {completedGenerations.filter(g => g.status === 'complete').length} candidates
                </span>
              </div>

              <div className="candidates-carousel">
                {completedGenerations
                  .filter(g => g.status === 'complete')
                  .slice(0, 6)
                  .map((gen, idx) => {
                    const isActive = activeMasterId === gen.id;
                    return (
                      <div
                        key={gen.id}
                        className={`candidate-card ${isActive ? 'is-active' : ''}`}
                        onClick={() => !isActive && handleSaveToSlot(gen.id, true)}
                      >
                        {isActive && <div className="active-badge">ACTIVE</div>}
                        <div className="candidate-image">
                          {gen.output_image_url ? (
                            <img src={gen.output_image_url} alt={`Candidate ${idx + 1}`} />
                          ) : (
                            <div className="placeholder">No image</div>
                          )}
                        </div>
                        <div className="candidate-info">
                          <span className="candidate-label">#{idx + 1}</span>
                          <span className="candidate-time">
                            {new Date(gen.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="candidate-actions">
                          {!isActive && (
                            <button
                              className="btn-save"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSaveToSlot(gen.id, true);
                              }}
                            >
                              Set Active
                            </button>
                          )}
                          <button
                            className="btn-view"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewingGeneration(gen);
                            }}
                          >
                            View
                          </button>
                        </div>
                      </div>
                    );
                  })}

                <div className="candidate-card new-candidate" onClick={handleGenerateClick}>
                  <div className="candidate-image placeholder">
                    <span className="plus-icon">+</span>
                  </div>
                  <div className="candidate-info">
                    <span className="candidate-label">New</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Variant Slots */}
            <div className="slot-section variants-section">
              <div className="slot-header">
                <h3>Variant Slots</h3>
              </div>

              <div className="variant-slots-grid">
                {['SIDE_LEFT', 'SIDE_RIGHT', 'FRONT_3_4', 'BACK'].map(variantType => (
                  <div key={variantType} className="variant-slot-card">
                    <h4>{variantType.replace('_', ' ')}</h4>
                    <div className="mini-carousel">
                      <div className="mini-candidate empty">
                        <span>—</span>
                      </div>
                      <div className="mini-candidate empty">
                        <span>—</span>
                      </div>
                      <div className="mini-candidate new">
                        <span>+</span>
                      </div>
                    </div>
                    <button className="btn-generate-variant">Generate</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Generations */}
            {activeGenerations.length > 0 && (
              <div className="active-generations-section">
                <h3>Active Generations</h3>
                {activeGenerations.map(gen => (
                  <div key={gen.id} className="active-generation-card">
                    <div className="gen-info">
                      <div className="gen-icon">🎨</div>
                      <div className="gen-details">
                        <h4>Master for {selectedAsset.name}</h4>
                        <p className="gen-id">ID: {gen.id}</p>
                      </div>
                    </div>
                    <div className="gen-progress">
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${gen.progress_percentage}%` }}
                        ></div>
                      </div>
                      <div className="progress-text">
                        <span>{gen.progress_percentage}%</span>
                        <span className="progress-step">{gen.current_step}</span>
                      </div>
                    </div>
                    <button
                      className="btn-cancel"
                      onClick={() => handleCancelGeneration(gen.id)}
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Generation History */}
            <div className="history-section">
              <div className="history-header">
                <h3>Generation History</h3>
                <span className="history-stats">
                  Today • {completedGenerations.length} items •
                  ${completedGenerations.reduce((sum, g) => sum + (g.cost_usd || 0), 0).toFixed(3)}
                </span>
              </div>
              <div className="history-list">
                {completedGenerations.slice(0, 10).map(gen => (
                  <div
                    key={gen.id}
                    className={`history-item ${gen.status}`}
                  >
                    <div
                      className="status-indicator"
                      style={{ backgroundColor: getStatusColor(gen.status) }}
                    >
                      {gen.status === 'complete' ? '✓' : '✗'}
                    </div>
                    <div className="history-info">
                      <span className="history-time">
                        {new Date(gen.created_at).toLocaleTimeString()}
                      </span>
                      <span className="history-desc">
                        Master • {gen.model} • {(() => {
                          try {
                            const params = JSON.parse(gen.params || '{}');
                            return params.resolution || '2048x2048';
                          } catch {
                            return '2048x2048';
                          }
                        })()}
                      </span>
                      {gen.error_message && (
                        <span className="history-error">{gen.error_message}</span>
                      )}
                    </div>
                    <span className="history-cost">${(gen.cost_usd || 0).toFixed(3)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="no-selection">
            <p>👈 Select an asset to start generating</p>
          </div>
        )}
      </div>

      {/* Generation Modal */}
      {showGenerateModal && (
        <div className="modal-overlay" onClick={() => setShowGenerateModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🎨 Generate Master - {selectedAsset?.name}</h2>
              <button className="modal-close" onClick={() => setShowGenerateModal(false)}>×</button>
            </div>

            <div className="modal-tabs">
              <button className="tab active">Prompt</button>
              <button className="tab">Settings</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Prompt</label>
                <textarea
                  value={generationPrompt}
                  onChange={e => setGenerationPrompt(e.target.value)}
                  rows={12}
                  className="prompt-textarea"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Model</label>
                  <select
                    value={generationModel}
                    onChange={e => setGenerationModel(e.target.value)}
                  >
                    <option value="gemini-3-pro-image">Gemini 3 Pro Image (Highest Quality)</option>
                    <option value="gemini-2.5-flash-image">Gemini 2.5 Flash (Faster)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Resolution</label>
                  <select
                    value={generationResolution}
                    onChange={e => setGenerationResolution(e.target.value)}
                  >
                    <option value="1024x1024">1024×1024</option>
                    <option value="2048x2048">2048×2048 (Recommended)</option>
                    <option value="2048x1365">2048×1365 (3:2 Landscape)</option>
                  </select>
                </div>
              </div>

              <div className="cost-estimate">
                <span>💰 Estimated Cost: <strong>$0.039</strong></span>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowGenerateModal(false)}
                disabled={isGenerating}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleConfirmGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? 'Generating...' : 'Generate Master'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Generation Modal */}
      {viewingGeneration && (
        <div className="modal-overlay" onClick={() => setViewingGeneration(null)}>
          <div className="modal-content view-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📋 Generation Details</h2>
              <button className="modal-close" onClick={() => setViewingGeneration(null)}>×</button>
            </div>

            <div className="modal-body">
              {viewingGeneration.output_image_url && (
                <div className="view-image-container">
                  <img src={viewingGeneration.output_image_url} alt="Generated" />
                </div>
              )}

              <div className="generation-details">
                <div className="detail-row">
                  <span className="detail-label">Request ID:</span>
                  <span className="detail-value">{viewingGeneration.id}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Status:</span>
                  <span className="detail-value">{viewingGeneration.status}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Model:</span>
                  <span className="detail-value">{viewingGeneration.model}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Resolution:</span>
                  <span className="detail-value">
                    {(() => {
                      try {
                        const params = JSON.parse(viewingGeneration.params || '{}');
                        return params.resolution || '2048x2048';
                      } catch {
                        return '2048x2048';
                      }
                    })()}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Cost:</span>
                  <span className="detail-value">${viewingGeneration.cost_usd?.toFixed(3) || '0.000'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Created:</span>
                  <span className="detail-value">{new Date(viewingGeneration.created_at).toLocaleString()}</span>
                </div>
              </div>

              <div className="form-group">
                <label>Prompt Used</label>
                <textarea
                  value={viewingGeneration.prompt}
                  readOnly
                  rows={15}
                  className="prompt-textarea readonly"
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setViewingGeneration(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
