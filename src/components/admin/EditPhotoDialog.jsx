import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import DatePicker from 'react-datepicker';
import { zhCN } from 'date-fns/locale';
import { FilmStockInput } from './FilmStockInput';
import { PHOTO_CATEGORIES as tabs } from '../../utils/photoCategories';
import { useAnimatedPresence } from '../../hooks/useAnimatedPresence';
import { AnimatedMessage } from '../AnimatedMessage';

// Keep the last open form intact while the same presence timeline reverses.
export function EditPhotoDialog(props) {
  const { open, onPresenceChange } = props;
  const rootRef = useRef(null);
  const returnFocusRef = useRef(null);
  const titleId = useId();
  const [retained, setRetained] = useState(open ? props : null);
  useLayoutEffect(() => { if (open) setRetained(props); }, [open, props]);
  const finishExit = useCallback(() => {
    setRetained(null);
    if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus({ preventScroll: true });
  }, []);
  const present = useAnimatedPresence(open, rootRef, { panelSelector: '.edit-modal-content', onExited: finishExit });
  useEffect(() => { onPresenceChange?.(present); }, [present, onPresenceChange]);
  useEffect(() => {
    if (!present) return;
    const root = rootRef.current;
    const previous = document.activeElement;
    returnFocusRef.current = previous;
    root?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected && (root?.contains(document.activeElement) || document.activeElement === document.body)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [present]);
  useEffect(() => {
    if (present) rootRef.current?.focus({ preventScroll: true });
  }, [open, present]);
  const view = open ? props : retained;
  if (!present || !view) return null;
  const {
    handleCancelEdit,
    isSavingEdit,
    isDeletingPhoto,
    submitMessage,
    editFeedbackRef,
    editForm,
    setEditForm,
    setShowEditCategoryDropdown,
    showEditCategoryDropdown,
    parseDateValue,
    formatDateValue,
    setShowEditCameraDropdown,
    showEditCameraDropdown,
    cameraOptions,
    setShowEditLensDropdown,
    showEditLensDropdown,
    lensOptions,
    filmStockOptions,
    rememberFilmStock,
    setShowEditLocationPicker,
    isDeleteConfirmOpen,
    deleteConfirmInput,
    setDeleteConfirmInput,
    deleteConfirmExpectedText,
    setIsDeleteConfirmOpen,
    handleDeleteFromEdit,
    isDeleteConfirmMatched,
    handleSaveEdit
  } = view;
  const handleKeyDown = event => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      event.preventDefault();
      if (!open || isSavingEdit || isDeletingPhoto) return;
      if (isDeleteConfirmOpen) { setIsDeleteConfirmOpen(false); setDeleteConfirmInput(''); }
      else handleCancelEdit();
    }
    if (event.key !== 'Tab') return;
    const controls = [...rootRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')]
      .filter(element => !element.closest('fieldset:disabled') && element.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (!open || !controls.length) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === rootRef.current)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === rootRef.current)) {
      event.preventDefault(); first.focus();
    }
  };
  return (
    <div
      ref={rootRef}
      className="edit-modal-backdrop"
      data-state={open ? 'open' : 'closing'}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
      onClick={() => { if (open) handleCancelEdit(); }}
    >
      <div
        className="edit-modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        inert={!open}
        aria-busy={isSavingEdit}
        style={{
          background: 'var(--bg)',
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          border: '1px solid var(--border)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          scrollbarWidth: 'none', /* Firefox */
          msOverflowStyle: 'none' /* IE and Edge */
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <fieldset disabled={!open || isSavingEdit || isDeletingPhoto} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <h2 id={titleId} style={{
          marginBottom: '24px',
          fontSize: '1.5rem',
          color: 'var(--text)',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '16px'
        }}>
          编辑作品信息
        </h2>
        <AnimatedMessage message={submitMessage} feedbackRef={editFeedbackRef} />

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{
            fontSize: '1.1rem',
            color: 'var(--text)',
            marginBottom: '16px',
            fontWeight: '600'
          }}>
            基本信息
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>标题 <span className="required">*</span></label>
              <input
                type="text"
                placeholder="请输入作品标题"
                value={editForm.title}
                onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                  fontSize: '0.95rem'
                }}
              />
            </div>

            <div className="form-group">
              <label>拍摄地点 <span className="required">*</span></label>
              <input
                type="text"
                placeholder="城市/地标"
                value={editForm.location}
                onChange={(e) => setEditForm(prev => ({ ...prev, location: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                  fontSize: '0.95rem'
                }}
              />
            </div>

            <div className="form-group">
              <label>国家/地区 <span className="required">*</span></label>
              <input
                type="text"
                placeholder="例如: 冰岛"
                value={editForm.country}
                onChange={(e) => setEditForm(prev => ({ ...prev, country: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                  fontSize: '0.95rem'
                }}
              />
            </div>

            <div className="form-group">
              <label>分类 <span className="required">*</span></label>
              <div
                style={{ position: 'relative' }}
                tabIndex={-1}
                onBlur={() => setShowEditCategoryDropdown(false)}
              >
                <button
                  type="button"
                  onClick={() => setShowEditCategoryDropdown((v) => !v)}
                  className="category-select-display"
                  style={{
                    width: '100%',
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--text)',
                  }}
                >
                  <span className="category-select-text">
                    {tabs.find((tab) => tab.id === editForm.category)?.label || '最新'}
                  </span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="category-select-arrow"
                    style={{ transform: showEditCategoryDropdown ? 'translateY(-50%) rotate(180deg)' : undefined }}
                  >
                    <path
                      d="M3 4.5L6 7.5L9 4.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {showEditCategoryDropdown && (
                  <div
                    className="admin-dropdown-panel"
                    style={{
                      zIndex: 60,
                    }}
                  >
                    {tabs.map((tab) => {
                      const active = tab.id === editForm.category;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setEditForm((prev) => ({
                              ...prev,
                              category: tab.id,
                              filmStock: tab.id === 'film' ? prev.filmStock : '',
                            }));
                            setShowEditCategoryDropdown(false);
                          }}
                          className={`admin-dropdown-item ${active ? 'is-active' : ''}`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label>评级（1-10）</label>
              <input
                type="number"
                min="1"
                max="10"
                value={editForm.rating}
                onChange={(e) => setEditForm(prev => ({ ...prev, rating: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                  fontSize: '0.95rem'
                }}
              />
            </div>

            <div className="form-group">
              <label>拍摄日期</label>
              <DatePicker
                selected={parseDateValue(editForm.shotDate)}
                onChange={(date) =>
                  setEditForm((prev) => ({ ...prev, shotDate: formatDateValue(date) }))
                }
                locale={zhCN}
                dateFormat="yyyy-MM-dd"
                placeholderText="请选择拍摄日期"
                calendarClassName="admin-date-calendar"
                className="admin-date-input"
                popperClassName="admin-date-popper"
                showPopperArrow={false}
              />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{
            fontSize: '1.1rem',
            color: 'var(--text)',
            marginBottom: '16px',
            fontWeight: '600'
          }}>
            相机参数
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
          <div className="form-group">
            <label>焦距</label>
            <input
              type="text"
              placeholder="例如: 50mm"
              value={editForm.focal}
              onChange={(e) => setEditForm(prev => ({ ...prev, focal: e.target.value }))}
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text)'
              }}
            />
          </div>

          <div className="form-group">
            <label>光圈</label>
            <input
              type="text"
              placeholder="例如: f/2.8"
              value={editForm.aperture}
              onChange={(e) => setEditForm(prev => ({ ...prev, aperture: e.target.value }))}
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text)'
              }}
            />
          </div>

          <div className="form-group">
            <label>快门</label>
            <input
              type="text"
              placeholder="例如: 1/125s"
              value={editForm.shutter}
              onChange={(e) => setEditForm(prev => ({ ...prev, shutter: e.target.value }))}
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text)'
              }}
            />
          </div>

          <div className="form-group">
            <label>ISO</label>
            <input
              type="text"
              placeholder="例如: 200"
              value={editForm.iso}
              onChange={(e) => setEditForm(prev => ({ ...prev, iso: e.target.value }))}
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text)'
              }}
            />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>相机</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="例如: Canon EOS 5D Mark IV"
                value={editForm.camera}
                onChange={(e) => setEditForm((prev) => ({ ...prev, camera: e.target.value }))}
                onFocus={() => setShowEditCameraDropdown(true)}
                onBlur={() => setTimeout(() => setShowEditCameraDropdown(false), 120)}
                autoComplete="off"
                style={{
                  width: '100%',
                  padding: '10px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text)'
                }}
              />
              {showEditCameraDropdown && editForm.camera && (
                <div
                  className="admin-dropdown-panel"
                  style={{
                    maxHeight: 160,
                    overflowY: 'auto',
                    zIndex: 20,
                  }}
                >
                  {cameraOptions
                    .filter((opt) =>
                      opt.toLowerCase().includes(editForm.camera.toLowerCase())
                    )
                    .map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setEditForm((prev) => ({ ...prev, camera: opt }));
                          setShowEditCameraDropdown(false);
                        }}
                        className={`admin-dropdown-item ${
                          opt === editForm.camera ? 'is-active' : ''
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>镜头</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="例如: EF 70-200mm f/2.8L"
                value={editForm.lens}
                onChange={(e) => setEditForm((prev) => ({ ...prev, lens: e.target.value }))}
                onFocus={() => setShowEditLensDropdown(true)}
                onBlur={() => setTimeout(() => setShowEditLensDropdown(false), 120)}
                autoComplete="off"
                style={{
                  width: '100%',
                  padding: '10px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text)'
                }}
              />
              {showEditLensDropdown && editForm.lens && (
                <div
                  className="admin-dropdown-panel"
                  style={{
                    maxHeight: 160,
                    overflowY: 'auto',
                    zIndex: 20,
                  }}
                >
                  {lensOptions
                    .filter((opt) =>
                      opt.toLowerCase().includes(editForm.lens.toLowerCase())
                    )
                    .map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setEditForm((prev) => ({ ...prev, lens: opt }));
                          setShowEditLensDropdown(false);
                        }}
                        className={`admin-dropdown-item ${
                          opt === editForm.lens ? 'is-active' : ''
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
          {editForm.category === 'film' && (
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>胶卷</label>
              <div style={{ position: 'relative' }}>
                <FilmStockInput
                  value={editForm.filmStock}
                  onChange={(filmStock) => setEditForm((prev) => ({ ...prev, filmStock }))}
                  options={filmStockOptions}
                  onRemember={rememberFilmStock}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)'
                  }}
                />
              </div>
            </div>
          )}
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h3
            style={{
              fontSize: '1.1rem',
              color: 'var(--text)',
              marginBottom: '12px',
              fontWeight: '600',
            }}
          >
            显示控制
          </h3>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={!editForm.hidden}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, hidden: !e.target.checked }))
              }
              style={{ width: '16px', height: '16px' }}
            />
            <span>
              在前台展示这张照片
              <span style={{ marginLeft: '6px', color: 'var(--muted)', fontSize: '0.85rem' }}>
                （取消勾选则仅在后台保留，前台不会显示）
              </span>
            </span>
          </label>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{
            fontSize: '1.1rem',
            color: 'var(--text)',
            marginBottom: '16px',
            fontWeight: '600'
          }}>
            地理位置
          </h3>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              {editForm.latitude != null && editForm.longitude != null ? (
                <>
                  <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
                    纬度: {Number(editForm.latitude).toFixed(6)}, 经度: {Number(editForm.longitude).toFixed(6)}
                    {editForm.altitude != null && `, 海拔: ${editForm.altitude}m`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowEditLocationPicker(true)}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    修改位置
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditForm(prev => ({
                        ...prev,
                        latitude: null,
                        longitude: null,
                        altitude: null
                      }));
                    }}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(255, 0, 0, 0.1)',
                      border: '1px solid rgba(255, 0, 0, 0.3)',
                      borderRadius: '6px',
                      color: '#ff6b6b',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    清除位置
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowEditLocationPicker(true)}
                  style={{
                    padding: '8px 16px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                  }}
                >
                  选择位置
                </button>
              )}
            </div>
          </div>
        </div>

        {isDeleteConfirmOpen && (
          <div className="edit-delete-confirm" role="alertdialog" aria-live="polite">
            <div className="edit-delete-confirm-header">
              <strong>确认永久删除</strong>
              <span>会同步删除作品记录，并尝试清理 OSS 原图和缩略图。</span>
            </div>
            <label>
              输入作品标题确认删除
              <input
                type="text"
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                placeholder={deleteConfirmExpectedText}
                disabled={isDeletingPhoto}
              />
            </label>
            <div className="edit-delete-confirm-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  setDeleteConfirmInput('');
                }}
                disabled={isDeletingPhoto}
              >
                取消删除
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleDeleteFromEdit}
                disabled={!isDeleteConfirmMatched || isDeletingPhoto}
              >
                {isDeletingPhoto ? '正在删除...' : '永久删除'}
              </button>
            </div>
          </div>
        )}

        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'space-between',
          marginTop: '24px',
          paddingTop: '20px',
          borderTop: '1px solid var(--border)'
        }}>
          <button
            type="button"
            className="btn-delete-trigger"
            onClick={() => {
              setIsDeleteConfirmOpen(true);
              setDeleteConfirmInput('');
            }}
            disabled={isDeletingPhoto}
            style={{
              padding: '10px 20px',
              background: 'rgba(231, 76, 60, 0.1)',
              border: '1px solid rgba(231, 76, 60, 0.3)',
              borderRadius: '8px',
              color: '#e74c3c',
              cursor: isDeletingPhoto ? 'wait' : 'pointer',
              fontSize: '0.95rem',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(231, 76, 60, 0.2)';
              e.target.style.borderColor = 'rgba(231, 76, 60, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'rgba(231, 76, 60, 0.1)';
              e.target.style.borderColor = 'rgba(231, 76, 60, 0.3)';
            }}
          >
            删除作品
          </button>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleCancelEdit}
              disabled={isSavingEdit || isDeletingPhoto}
              style={{ padding: '10px 20px' }}
            >
              取消
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSaveEdit}
              disabled={isSavingEdit || isDeletingPhoto}
              style={{ padding: '10px 20px' }}
            >
              {isSavingEdit ? '正在保存...' : '保存'}
            </button>
          </div>
      </div>
        </fieldset>
      </div>
    </div>
  );
}
