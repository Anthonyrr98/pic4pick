/**
 * 时间相关工具函数
 */

export interface ShotTimeInfo {
  yearsAgoText: string;
  dateText: string;
}

// 根据拍摄日期计算"几年前"和格式化日期
export const getShotTimeInfo = (shotDateValue: string | null | undefined): ShotTimeInfo => {
  if (!shotDateValue) {
    return { yearsAgoText: '未知', dateText: '拍摄日期未设置' };
  }

  const date = new Date(shotDateValue);
  if (Number.isNaN(date.getTime())) {
    return { yearsAgoText: '未知', dateText: '拍摄日期格式不正确' };
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffYears = Math.floor(diffMs / (365 * 24 * 60 * 60 * 1000));

  let yearsAgoText: string;
  if (diffYears <= 0) {
    yearsAgoText = '今年';
  } else if (diffYears === 1) {
    yearsAgoText = '1 年前';
  } else {
    yearsAgoText = `${diffYears} 年前`;
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dateText = `${year}年${month}月${day}日`;

  return { yearsAgoText, dateText };
};

// 获取照片排序的时间值
export const getTimeValue = (photo: any): number => {
  if (photo.shotDate) {
    const t = new Date(photo.shotDate).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (photo.createdAt) {
    const t = new Date(photo.createdAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (typeof photo.id === 'number') return photo.id;
  if (typeof photo.id === 'string') {
    const n = Number(photo.id);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
};
