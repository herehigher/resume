import { DEFAULT_LOCALE, STATE_VERSION, SUPPORTED_LOCALES } from '../config.js';

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createDefaultProfile() {
  return {
    photo: '',
    fields: {
      fullName: '',
      birthDate: '',
      gender: '',
      postalCode: '',
      address: '',
      phone: '',
      email: '',
      links: []
    }
  };
}

export function createJapaneseDocument() {
  return {
    activeDocument: 'resume',
    fields: {
      nameKana: '',
      addressKana: '',
      createdDate: today(),
      motivation: '',
      requests: '',
      careerSummary: '',
      skills: '',
      selfPromotion: ''
    },
    education: [{ date: '', detail: '' }],
    employment: [{ date: '', detail: '' }],
    qualification: [{ date: '', detail: '', url: '' }],
    careers: [{
      company: '',
      role: '',
      startDate: '',
      endDate: '',
      companyInfo: '',
      responsibilities: '',
      achievements: ''
    }]
  };
}

export function createChineseDocument() {
  return {
    activeDocument: 'resume',
    resume: {
      headline: '',
      summary: '',
      education: [{ startDate: '', endDate: '', school: '', degree: '', details: '' }],
      experience: [{ startDate: '', endDate: '', company: '', role: '', details: '' }],
      projects: [{ startDate: '', endDate: '', name: '', role: '', details: '', url: '' }],
      skills: '',
      certifications: [{ date: '', name: '', url: '' }]
    }
  };
}

export function createEnglishDocument() {
  return {
    activeDocument: 'resume',
    resume: {
      headline: '',
      location: '',
      summary: '',
      education: [{ startDate: '', endDate: '', school: '', degree: '', details: '' }],
      experience: [{ startDate: '', endDate: '', company: '', role: '', details: '' }],
      projects: [{ startDate: '', endDate: '', name: '', role: '', details: '', url: '' }],
      skills: '',
      certifications: [{ date: '', name: '', url: '' }]
    }
  };
}

export function createDefaultState(locale = DEFAULT_LOCALE) {
  const safeLocale = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  return {
    version: STATE_VERSION,
    settings: {
      locale: safeLocale,
      pageSizeByLocale: {
        ja: 'A4',
        'zh-CN': 'A4',
        en: 'LETTER'
      }
    },
    profile: createDefaultProfile(),
    documents: {
      ja: createJapaneseDocument(),
      'zh-CN': createChineseDocument(),
      en: createEnglishDocument()
    }
  };
}

export function createJapaneseSampleState(sourceState) {
  const state = cloneData(sourceState);
  state.profile = {
    photo: '',
    fields: {
      fullName: '山田 太郎',
      birthDate: '1992-04-15',
      gender: '',
      postalCode: '100-0001',
      address: '東京都千代田区千代田1-1',
      phone: '090-1234-5678',
      email: 'taro.yamada@example.jp',
      links: ['https://github.com/taro-yamada', 'https://www.linkedin.com/in/taro-yamada', 'https://example.com']
    }
  };
  state.documents.ja = {
    activeDocument: 'resume',
    fields: {
      nameKana: 'やまだ たろう',
      addressKana: 'とうきょうとちよだくちよだ',
      createdDate: today(),
      motivation: 'これまで培った企画力とチームでのプロジェクト推進経験を活かし、貴社のサービス成長に貢献したいと考え志望いたしました。顧客の声とデータの双方から課題を整理し、関係者と合意形成しながら改善を進めることを得意としています。',
      requests: '貴社規定に従います。',
      careerSummary: '大学卒業後、ITサービス企業にて法人向けプロダクトの企画・運営に従事してきました。顧客課題の分析、要件定義、開発チームとの連携、リリース後の改善まで一貫して担当しています。直近では5名のチームをリードし、主要指標を前年比125%まで改善しました。',
      skills: '・プロダクト企画、要件定義、ロードマップ策定\n・データ分析、KPI設計、ユーザーインタビュー\n・プロジェクト管理、チームマネジメント\n・英語：ビジネスレベル',
      selfPromotion: '私の強みは、曖昧な課題を構造化し、チームを巻き込みながら成果につなげる推進力です。現職では利用率低下の原因を定量・定性の両面から分析し、オンボーディングの改善を提案しました。開発・営業・サポートと共通目標を設定して施策を実行した結果、3か月で継続率を18ポイント改善しました。'
    },
    education: [
      { date: '2011-04', detail: '○○大学 ○○学部 入学' },
      { date: '2015-03', detail: '○○大学 ○○学部 卒業' }
    ],
    employment: [
      { date: '2015-04', detail: '株式会社サンプル 入社' },
      { date: '2021-10', detail: 'プロダクト企画部 マネージャー就任' },
      { date: '', detail: '現在に至る' }
    ],
    qualification: [
      { date: '2014-08', detail: '普通自動車第一種運転免許 取得', url: '' },
      { date: '2020-12', detail: 'TOEIC Listening & Reading 850点 取得', url: '' }
    ],
    careers: [{
      company: '株式会社サンプル',
      role: 'プロダクト企画部 マネージャー',
      startDate: '2015-04',
      endDate: '',
      companyInfo: '法人向けクラウドサービスの企画・開発・運営（従業員約300名）',
      responsibilities: '・法人向けSaaSプロダクトの企画、要件定義\n・利用データおよび顧客インタビューに基づく改善施策の立案\n・エンジニア、デザイナー、営業とのプロジェクト推進\n・5名の企画チームのマネジメント',
      achievements: '・オンボーディング改善により継続率を18ポイント向上\n・新機能の企画・提供により主要指標を前年比125%へ改善\n・開発プロセスの見直しによりリードタイムを30%短縮'
    }]
  };
  return state;
}
