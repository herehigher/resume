import { cloneData } from './defaults.js';

export function createChineseSampleState(sourceState) {
  const state = cloneData(sourceState);
  state.profile = {
    photo: '',
    fields: {
      fullName: '林晓宇',
      birthDate: '',
      gender: '',
      postalCode: '200000',
      address: '上海市',
      phone: '138 0000 0000',
      email: 'xiaoyu.lin@example.com',
      github: 'https://github.com/xiaoyu-lin',
      linkedin: 'https://www.linkedin.com/in/xiaoyu-lin',
      portfolio: 'https://example.com/xiaoyu'
    }
  };
  state.documents['zh-CN'] = {
    activeDocument: 'resume',
    resume: {
      headline: '高级产品经理｜企业服务与数据产品',
      summary: '8 年互联网产品经验，持续负责企业服务产品从需求研究、方案设计到上线增长的完整过程。擅长将复杂业务拆解为可执行的产品路径，并通过用户反馈和数据验证推动跨职能团队达成目标。',
      experience: [
        {
          startDate: '2018-07',
          endDate: '2022-03',
          company: '云启科技有限公司',
          role: '产品经理',
          details: '• 负责客户数据平台的需求分析、产品规划与版本迭代\n• 建立用户反馈闭环，使重点客户续约率提升 12 个百分点\n• 协同研发和实施团队交付 20 余个企业客户项目'
        },
        {
          startDate: '2022-04',
          endDate: '',
          company: '星河数字科技有限公司',
          role: '高级产品经理',
          details: '• 主导企业分析产品的年度路线图与核心指标设计\n• 带领 6 人跨职能小组完成智能报表模块，发布半年内月活提升 35%\n• 通过访谈和行为数据重构新手引导，试用转化率提升 18%'
        }
      ],
      projects: [
        {
          startDate: '2023-02',
          endDate: '2023-10',
          name: '智能经营分析平台',
          role: '产品负责人',
          details: '面向连锁零售客户整合销售、库存和会员数据；定义指标体系与自助分析流程，支持客户将周报制作时间从 2 天缩短至 2 小时。',
          url: 'https://example.com/projects/analytics'
        },
        {
          startDate: '2021-05',
          endDate: '2021-12',
          name: '客户成功工作台',
          role: '核心产品经理',
          details: '设计客户健康度与风险预警能力，帮助客户成功团队统一跟进流程。',
          url: ''
        }
      ],
      education: [
        {
          startDate: '2012-09',
          endDate: '2016-06',
          school: '华东理工大学',
          degree: '信息管理与信息系统 · 本科',
          details: '主修数据分析、管理信息系统与项目管理。'
        }
      ],
      skills: '产品：用户研究、需求分析、产品规划、指标体系、增长实验\n协作：敏捷项目管理、跨团队沟通、团队带教\n工具：SQL、Figma、Tableau、Jira\n语言：中文（母语）、英语（商务沟通）',
      certifications: [
        {
          date: '2021-11',
          name: 'PMP 项目管理专业人士资格认证',
          url: 'https://www.pmi.org/certifications/certification-resources/registry'
        },
        {
          date: '2020-08',
          name: '数据分析专业证书',
          url: ''
        }
      ]
    }
  };
  return state;
}
