import type { Metadata } from 'next';
import SearchWorkbench from '@/components/SearchWorkbench';
import './globals.css';

export const metadata: Metadata = {
  title: 'ThreadHunt - global clothing price search',
  description: 'Find cheaper clothing matches across global marketplaces using free search sources, visual-search handoffs, and video frame extraction.',
};

export default function Page() {
  return <SearchWorkbench />;
}
