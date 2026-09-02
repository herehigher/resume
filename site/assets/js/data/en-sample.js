import { cloneData } from '../state/defaults.js';

export function createEnglishSampleState(sourceState) {
  const state = cloneData(sourceState);
  state.settings.locale = 'en';
  state.settings.pageSizeByLocale.en = 'LETTER';
  state.profile = {
    photo: '',
    fields: {
      fullName: 'Alex Morgan',
      birthDate: '',
      gender: '',
      postalCode: '',
      address: '',
      phone: '+1 206 555 0142',
      email: 'alex.morgan@example.com',
      links: ['https://github.com/alexmorgan', 'https://www.linkedin.com/in/alexmorgan', 'https://alexmorgan.example.com']
    }
  };
  state.documents.en = {
    activeDocument: 'resume',
    resume: {
      headline: 'Senior Product Manager',
      location: 'Seattle, WA / United States',
      summary: 'Product leader with 8+ years of experience turning customer problems into measurable growth. Led cross-functional teams that improved activation by 24% and reduced time to value by 35%.',
      experience: [
        {
          startDate: '2021-06',
          endDate: '',
          company: 'Northstar Software',
          role: 'Senior Product Manager',
          details: 'Led a product squad across engineering, design, analytics, and go-to-market.\nImproved new-customer activation by 24% through onboarding experiments.\nReduced enterprise implementation time by 35% by redesigning the setup workflow.'
        },
        {
          startDate: '2017-03',
          endDate: '2021-05',
          company: 'Harbor Analytics',
          role: 'Product Manager',
          details: 'Launched reporting capabilities used by 1,200+ customers.\nBuilt a research program that informed quarterly roadmap decisions.'
        }
      ],
      projects: [
        {
          startDate: '2024-01',
          endDate: '2024-06',
          name: 'Self-service Adoption Program',
          role: 'Program Lead',
          details: 'Designed an experimentation program that increased self-service adoption by 19%.',
          url: 'https://alexmorgan.example.com/adoption-program'
        }
      ],
      education: [
        {
          startDate: '2011-09',
          endDate: '2015-06',
          school: 'University of Washington',
          degree: 'B.A. in Business Administration',
          details: 'Concentration in Information Systems'
        }
      ],
      skills: 'Product strategy, Roadmapping, Customer research, Experiment design, SQL, Analytics, Agile delivery, Cross-functional leadership',
      certifications: [
        {
          date: '2023-11',
          name: 'Certified Scrum Product Owner (CSPO)',
          url: 'https://example.com/credentials/alex-morgan-cspo'
        }
      ]
    }
  };
  return state;
}
