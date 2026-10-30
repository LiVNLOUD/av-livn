import type { Component } from '../types';
import { localParts } from '../util';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export const mevsim_katsayisi: Component = ({ series, profile }) => {
  const { month } = localParts(series.at);
  const v = profile.season[String(month)];
  if (v === undefined) return { value: null, reason: 'mevsim tablosu yok' };
  return { value: v, reason: `${MONTHS[month - 1]} katsayısı ${v}` };
};
