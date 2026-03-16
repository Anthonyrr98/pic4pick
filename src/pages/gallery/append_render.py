import re

file = r'F:\Github\Pic4Pick\src\pages\gallery\GalleryPage.jsx'

with open(file, 'r', encoding='utf-8') as f:
    content = f.read()

# 截断到 RENDER_MARKER 之前
marker = '  // RENDER_MARKER'
idx = content.find(marker)
if idx != -1:
    content = content[:idx]

# 追加干净的 render
render = '''
  return (
    <div className={`app-shell ${activeView === 'explore-view' ? 'explore-mode' : ''}`}>
      <header className="app-header">
        <div className="brand">
          {activeView === 'gallery-view' && (brandLogo ? <img src={brandLogo} alt={brandText.siteTitle} className="brand-logo-img" /> : <div className="logo-mark" aria-hidden="true" />)}
          {activeView === 'gallery-view' && (<div className="brand-copy"><div className="brand-name">{brandText.siteTitle}</div><div className="brand-subtitle">{brandText.siteSubtitle}</div></div>)}
        </div>
        <nav className="primary-menu" />
        <div className={`view-toggle ${activeView === 'explore-view' ? 'explore-active' : ''}`}>
          <button className={`toggle-btn ${activeView === 'gallery-view' ? 'active' : ''}`} onClick={() => handleViewChange('gallery-view')}><span className="toggle-label">\u56fe\u5e93</span></button>
          <button className={`toggle-btn ${activeView === 'explore-view' ? 'active' : ''}`} onClick={() => handleViewChange('explore-view')}><span className="toggle-label">\u53d1\u73b0</span></button>
        </div>
      </header>
      <main className={activeView === 'explore-view' ? 'explore-fullscreen' : ''}>
        {supabase && supabaseError && (<div style={{ margin: '0 0 16px', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--warning)', fontSize: '0.9rem' }}>{supabaseError}</div>)}
        <section id="gallery-view" className={`screen ${activeView === 'gallery-view' ? 'active' : ''}`}>
          {filteredPhotos.length > 0 && (<><TabStrip activeFilter={activeFilter} onFilterChange={setActiveFilter} /><PhotoGrid photos={displayedPhotos} likedPhotoIds={likedPhotoIds} onPhotoClick={setLightboxPhoto} onToggleLike={handleToggleLike} hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} loadMoreRef={loadMoreRef} totalCount={filteredPhotos.length} /></>)}
        </section>
        {activeView === 'explore-view' && (
          <section id="explore-view" className="screen active">
            <CurationPanel groups={curationGroups} expandedCategories={expandedCategories} onToggleCategory={(id) => setExpandedCategories((prev) => ({ ...prev, [id]: !prev[id] }))} onCityClick={handleCityCardClick} activeCitySelection={activeCitySelection} isPanelCollapsed={isPanelCollapsed} onTogglePanelCollapse={() => setIsPanelCollapsed((p) => !p)} />
            <div className="map-wrapper">
              {exploreMapHint && (<div style={{ position: 'absolute', top: '18px', right: '18px', zIndex: 8, padding: '10px 12px', borderRadius: '14px', background: 'rgba(17,18,24,0.72)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)', maxWidth: 'min(420px,calc(100vw - 48px))', fontSize: '0.85rem' }}>{exploreMapHint}</div>)}
              <div id="mapCanvas" ref={mapContainerRef} />
            </div>
          </section>
        )}
      </main>
      <LocationPanel data={locationPanel} onClose={() => setLocationPanel(null)} onPhotoClick={(p) => setLightboxPhoto(p)} />
      <div className={`lightbox ${lightboxPhoto ? 'active' : ''}`} aria-hidden={lightboxPhoto ? 'false' : 'true'} onClick={(e) => { if (e.target === e.currentTarget) { setLightboxPhoto(null); setShowMobileMeta(false); } }}>
        <button className="lightbox-close" aria-label="\u5173\u95ed" onClick={() => { setLightboxPhoto(null); setShowMobileMeta(false); }}>&times;</button>
        <div className="lightbox-panel" style={{ backgroundImage: lightboxPhoto ? `url(${lightboxPhoto.image})` : 'none' }} onClick={(e) => e.stopPropagation()}>
          <div className={`lightbox-content-wrapper ${showMobileMeta ? 'meta-visible' : ''}`}>
            <div className="lightbox-media" onClick={() => { if (window.innerWidth <= 768) setShowMobileMeta((p) => !p); }}>
              {lightboxPhoto && <img src={lightboxPhoto.image} alt={lightboxPhoto.title} />}
            </div>
            {lightboxPhoto && (
              <div className={`lightbox-meta ${showMobileMeta ? 'mobile-visible' : ''}`}>
                <div className="lightbox-title-section"><h3>{lightboxPhoto.title}</h3><p className="subtitle">{lightboxPhoto.country} \u00b7 {lightboxPhoto.location}</p></div>
                <div className="lightbox-params-grid" onClick={(e) => { if (window.innerWidth <= 768) e.stopPropagation(); }}>
                  {[['\u7126\u8ddd', lightboxPhoto.focal], ['\u5149\u5708', lightboxPhoto.aperture], ['\u5feb\u95e8', lightboxPhoto.shutter], ['ISO', lightboxPhoto.iso], ['\u76f8\u673a', lightboxPhoto.camera], ['\u955c\u5934', lightboxPhoto.lens]].map(([label, value]) => (<div key={label} className="lightbox-param-card" onClick={(e) => openMetaPopover('basic', e)}><span className="param-label">{label}</span><span className="param-value">{value}</span></div>))}
                </div>
              </div>
            )}
          </div>
        </div>
        {lightboxPhoto && metaPopover && (
          <div className="meta-popover-backdrop" onClick={(e) => { e.stopPropagation(); setMetaPopover(null); }}>
            <aside className="meta-popover" style={{ left: `${metaPopover.x}px`, top: `${metaPopover.y}px`, backgroundImage: lightboxPhoto ? `url(${lightboxPhoto.image})` : 'none', maxWidth: metaPopover.tab === 'geo' ? '520px' : '320px', maxHeight: metaPopover.tab === 'geo' ? '85vh' : 'auto', overflowY: metaPopover.tab === 'geo' ? 'auto' : 'hidden', overflowX: 'hidden' }} onClick={(e) => e.stopPropagation()}>
              <header className="meta-sidepanel-header">
                <div className="meta-tabs">
                  <button className={`meta-tab ${metaPopover.tab === 'basic' ? 'active' : ''}`} onClick={() => setMetaPopover((p) => ({ ...p, tab: 'basic' }))}>\u57fa\u672c\u53c2\u6570</button>
                  <button className={`meta-tab ${metaPopover.tab === 'geo' ? 'active' : ''}`} onClick={() => setMetaPopover((p) => ({ ...p, tab: 'geo' }))}>\u5730\u7406\u4f4d\u7f6e</button>
                </div>
                <button className="meta-close" onClick={() => setMetaPopover(null)} aria-label="\u5173\u95ed">\u00d7</button>
              </header>
              {metaPopover.tab === 'basic' && (
                <div className="meta-panel-body"><div className="meta-card-grid">
                  <article className="meta-card"><p className="meta-card-label">\u5149\u5708</p><p className="meta-card-main">{lightboxPhoto.aperture}</p></article>
                  <article className="meta-card"><p className="meta-card-label">\u5feb\u95e8</p><p className="meta-card-main">{lightboxPhoto.shutter}</p></article>
                  <article className="meta-card"><p className="meta-card-label">\u7126\u8ddd</p><p className="meta-card-main">{lightboxPhoto.focal}</p></article>
                  <article className="meta-card"><p className="meta-card-label">\u611f\u5149\u5ea6</p><p className="meta-card-main">{lightboxPhoto.iso}</p></article>
                  <article className="meta-card"><p className="meta-card-label">\u76f8\u673a</p><p className="meta-card-main">{lightboxPhoto.camera}</p></article>
                  <article className="meta-card"><p className="meta-card-label">\u955c\u5934</p><p className="meta-card-main">{lightboxPhoto.lens}</p></article>
                </div></div>
              )}
              {metaPopover.tab === 'geo' && (
                <div className="meta-panel-body" style={{ maxHeight: 'calc(90vh - 80px)', overflowY: 'auto' }}>
                  {getGeoInfo ? (
                    <>
                      <div ref={geoMapContainerRef} style={{ width: '100%', height: '240px', marginBottom: '16px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }} />
                      <div className="meta-card-grid">
                        <article className="meta-card"><p className="meta-card-label">\u7eac\u5ea6</p><p className="meta-card-main">{getGeoInfo.latDms}</p><p className="meta-card-sub">{getGeoInfo.lat}</p></article>
                        <article className="meta-card"><p className="meta-card-label">\u7ecf\u5ea6</p><p className="meta-card-main">{getGeoInfo.lonDms}</p><p className="meta-card-sub">{getGeoInfo.lon}</p></article>
                        <article className="meta-card"><p className="meta-card-label">\u6d77\u62d4</p><p className="meta-card-main">{getGeoInfo.altitude}</p></article>
                        <article className="meta-card"><p className="meta-card-label">\u8ddd\u79bb</p><p className="meta-card-main">{getGeoInfo.distance}</p>{getGeoInfo.browserLocation && <p className="meta-card-sub">\u8ddd\u5f53\u524d\u4f4d\u7f6e</p>}</article>
                      </div>
                    </>
                  ) : (
                    <div className="meta-card-grid"><article className="meta-card meta-card-wide"><p className="meta-card-label">\u5730\u70b9</p><p className="meta-card-main">\u6682\u65e0\u5730\u7406\u4f4d\u7f6e\u4fe1\u606f</p></article></div>
                  )}
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
'''

content = content + render + '\n}\n'

with open(file, 'w', encoding='utf-8') as f:
    f.write(content)
print('done, lines:', content.count('\n'))
