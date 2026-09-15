// A literal historical payload. Keep this independent from v4 factories so
// migration tests exercise the shape users actually stored under the v3 key.
export function createV3Fixture() {
  return {
    version: 3,
    settings: {
      locale: 'en',
      pageSizeByLocale: { ja: 'A4', 'zh-CN': 'A4', en: 'LETTER' },
      pageBreaks: {
        ja: { A4: { resume: ['qualifications'], career: ['career-history'] }, LETTER: { resume: [], career: [] } },
        'zh-CN': { A4: { resume: ['experience'] }, LETTER: { resume: [] } },
        en: { A4: { resume: ['projects'] }, LETTER: { resume: ['skills'] } }
      }
    },
    profile: {
      photo: '',
      fields: { fullName: 'Fictional v3 Person', birthDate: '', gender: '', nationality: '', postalCode: '', address: '', phone: '', email: 'v3-fixture@example.test', links: [] }
    },
    documents: {
      ja: {
        activeDocument: 'career',
        fields: { nameKana: '', addressKana: '', createdDate: '2026-09-15', motivation: '', requests: '', careerSummary: 'Fictional v3 career summary', skills: '', selfPromotion: '' },
        education: [], employment: [], qualification: [],
        careers: [{ company: 'Fictional v3 Japan', role: 'Fixture role', startDate: '2020-01', endDate: '', companyInfo: '', detailSections: [{ title: '担当業務', content: 'Fictional responsibility' }, { title: '実績・成果', content: '' }] }]
      },
      'zh-CN': {
        activeDocument: 'resume',
        resume: { headline: '', summary: '', education: [], experience: [{ startDate: '2020-01', endDate: '', company: 'Fictional v3 China', role: 'Fixture role', details: 'Fictional details' }], projects: [], skills: '', certifications: [] }
      },
      en: {
        activeDocument: 'resume',
        resume: { showOptionalPersonalDetails: false, headline: '', location: '', summary: '', education: [], experience: [{ startDate: '2020-01', endDate: '', company: 'Fictional v3 English', role: 'Fixture role', details: 'Fictional details' }], projects: [], skills: '', certifications: [] }
      }
    }
  };
}
