import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import './Elements.css';
import { GenerationModal } from '../components/elements/GenerationModal';
import { getAssets, type Asset as APIAsset, type AssetsResponse } from '../api/client';
import {
  getAssetElementSummary,
  generateElementVariantsBatch,
  deleteElementMaster,
  type ElementSummary,
} from '../services/elements';

type FilterType = 'all' | 'character' | 'location' | 'prop';

export default function Elements() {
  const { projectId } = useParams<{ projectId: string }>();
  const [assets, setAssets] = useState<APIAsset[]>([]);
  const [elementSummaries, setElementSummaries] = useState<Map<string, ElementSummary>>(new Map());
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  const [generationModalOpen, setGenerationModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<APIAsset | null>(null);
  const [expandedElements, setExpandedElements] = useState<Set<string>>(new Set());

  // Load assets and their element summaries
  const loadAssets = async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      const assetsResponse: AssetsResponse = await getAssets(projectId);

      // Flatten all assets into single array
      const allAssets = [
        ...assetsResponse.characters,
        ...assetsResponse.locations,
        ...assetsResponse.props,
      ];
      setAssets(allAssets);

      // Load element summaries for all assets
      const summaries = new Map<string, ElementSummary>();
      await Promise.all(
        allAssets.map(async (asset: APIAsset) => {
          try {
            const summary = await getAssetElementSummary(projectId, asset.id);
            summaries.set(asset.id, summary);
          } catch (err) {
            console.error(`Failed to load summary for ${asset.id}:`, err);
          }
        })
      );
      setElementSummaries(summaries);
    } catch (err) {
      console.error('Failed to load assets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssets();
  }, [projectId]);

  // Poll for generation status every 3 seconds if any masters are generating
  useEffect(() => {
    if (!projectId) return;

    const hasGenerating = Array.from(elementSummaries.values()).some(
      summary => summary.master?.status === 'generating'
    );

    if (!hasGenerating) return;

    const interval = setInterval(() => {
      loadAssets(); // Reload to get updated status
    }, 3000);

    return () => clearInterval(interval);
  }, [elementSummaries, projectId]);

  const handleGenerateMaster = (asset: APIAsset) => {
    setSelectedAsset(asset);
    setGenerationModalOpen(true);
  };

  const handleGenerationSuccess = async () => {
    // Reload element summary for this asset
    if (selectedAsset && projectId) {
      const summary = await getAssetElementSummary(projectId, selectedAsset.id);
      setElementSummaries(new Map(elementSummaries.set(selectedAsset.id, summary)));
    }
  };

  const handleGenerateVariants = async (assetId: string, masterId: string) => {
    if (!projectId) return;

    try {
      await generateElementVariantsBatch(projectId, masterId);
      // Reload summary
      const summary = await getAssetElementSummary(projectId, assetId);
      setElementSummaries(new Map(elementSummaries.set(assetId, summary)));
    } catch (err) {
      console.error('Failed to generate variants:', err);
      alert('Failed to generate variants');
    }
  };

  const handleDeleteMaster = async (assetId: string, masterId: string) => {
    if (!projectId) return;
    if (!confirm('Delete this master and all its variants?')) return;

    try {
      await deleteElementMaster(projectId, masterId);
      // Reload summary
      const summary = await getAssetElementSummary(projectId, assetId);
      setElementSummaries(new Map(elementSummaries.set(assetId, summary)));
    } catch (err) {
      console.error('Failed to delete master:', err);
      alert('Failed to delete master');
    }
  };

  const toggleExpand = (assetId: string) => {
    const newExpanded = new Set(expandedElements);
    if (newExpanded.has(assetId)) {
      newExpanded.delete(assetId);
    } else {
      newExpanded.add(assetId);
    }
    setExpandedElements(newExpanded);
  };

  const filteredAssets = assets.filter((asset) => {
    if (filter === 'all') return true;
    return asset.type === filter;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'character': return '👤';
      case 'location': return '📍';
      case 'prop': return '🔧';
      default: return '⭐';
    }
  };

  const getStatusBadge = (summary: ElementSummary | undefined) => {
    if (!summary || !summary.has_master) {
      return <span className="status-badge status-none">No Master</span>;
    }

    const master = summary.master!;
    if (master.status === 'generating') {
      return <span className="status-badge status-generating">⚡ Generating...</span>;
    }
    if (master.status === 'failed') {
      return <span className="status-badge status-failed">❌ Failed</span>;
    }
    if (master.status === 'complete') {
      return (
        <span className="status-badge status-complete">
          ✅ Master + {summary.variant_count} Variant{summary.variant_count !== 1 ? 's' : ''}
        </span>
      );
    }

    return <span className="status-badge status-pending">Pending</span>;
  };

  if (loading) {
    return (
      <div className="elements-page">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading elements...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="elements-page">
      <header className="elements-header">
        <h1>Elements Generator</h1>
        <p>Generate master reference images and variants for characters, locations, and props</p>
      </header>

      <div className="filter-bar">
        <button
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          ⚫ All ({assets.length})
        </button>
        <button
          className={`filter-btn ${filter === 'character' ? 'active' : ''}`}
          onClick={() => setFilter('character')}
        >
          👤 Characters ({assets.filter(a => a.type === 'character').length})
        </button>
        <button
          className={`filter-btn ${filter === 'location' ? 'active' : ''}`}
          onClick={() => setFilter('location')}
        >
          📍 Locations ({assets.filter(a => a.type === 'location').length})
        </button>
        <button
          className={`filter-btn ${filter === 'prop' ? 'active' : ''}`}
          onClick={() => setFilter('prop')}
        >
          🔧 Props ({assets.filter(a => a.type === 'prop').length})
        </button>
      </div>

      <div className="elements-list">
        {filteredAssets.length === 0 && (
          <div className="empty-state">
            <p>No {filter === 'all' ? 'assets' : filter + 's'} found</p>
            <p className="empty-hint">Create assets in the ASSETS phase first</p>
          </div>
        )}

        {filteredAssets.map((asset) => {
          const summary = elementSummaries.get(asset.id);
          const isExpanded = expandedElements.has(asset.id);

          return (
            <div key={asset.id} className="element-card">
              <div className="element-card-header" onClick={() => toggleExpand(asset.id)}>
                <div className="element-info">
                  <span className="element-icon">{getTypeIcon(asset.type)}</span>
                  <div>
                    <h3>{asset.name}</h3>
                    <p className="element-type">{asset.type}</p>
                  </div>
                </div>
                <div className="element-status">
                  {getStatusBadge(summary)}
                  <span className="expand-toggle">{isExpanded ? '▼' : '▶'}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="element-card-body">
                  <div className="element-description">
                    <strong>Description:</strong> {asset.appearance || asset.description || 'No description'}
                  </div>

                  {!summary || !summary.has_master ? (
                    <div className="no-master-state">
                      <p>⚠️ No master image generated yet</p>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleGenerateMaster(asset)}
                      >
                        + Generate Master
                      </button>
                    </div>
                  ) : (
                    <div className="master-section">
                      <div className="master-display">
                        <div className="image-grid">
                          {/* Master Image */}
                          <div className="image-item master-image">
                            <div className="image-label">MASTER</div>
                            {summary.master?.master_image_url ? (
                              <img
                                src={summary.master.master_image_url}
                                alt={`${asset.name} master`}
                              />
                            ) : (
                              <div className="image-placeholder">
                                <span className="spinner"></span>
                              </div>
                            )}
                          </div>

                          {/* Variant Images */}
                          {summary.variants.slice(0, 5).map((variant) => (
                            <div key={variant.id} className="image-item variant-image">
                              <div className="image-label">{variant.variant_type}</div>
                              {variant.image_url ? (
                                <img src={variant.image_url} alt={variant.variant_description} />
                              ) : (
                                <div className="image-placeholder">
                                  <span className="spinner"></span>
                                </div>
                              )}
                            </div>
                          ))}

                          {summary.variant_count > 5 && (
                            <div className="image-item more-indicator">
                              <div className="more-text">
                                +{summary.variant_count - 5} more
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="element-actions">
                        {summary.variant_count === 0 && (
                          <button
                            className="btn btn-primary"
                            onClick={() => handleGenerateVariants(asset.id, summary.master!.id)}
                          >
                            + Generate Standard Variants
                          </button>
                        )}
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleDeleteMaster(asset.id, summary.master!.id)}
                        >
                          🗑️ Delete Master
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {generationModalOpen && selectedAsset && projectId && (
        <GenerationModal
          isOpen={generationModalOpen}
          onClose={() => {
            setGenerationModalOpen(false);
            setSelectedAsset(null);
          }}
          projectId={projectId}
          assetId={selectedAsset.id}
          assetName={selectedAsset.name}
          assetType={selectedAsset.type as 'character' | 'location' | 'prop'}
          onSuccess={handleGenerationSuccess}
        />
      )}
    </div>
  );
}
