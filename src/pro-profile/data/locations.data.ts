export const LOCATIONS_DATA = {
  'United States': {
    nationwide: 'Nationwide',
    regions: {
      '🗽 Northeast': ['New York', 'Massachusetts', 'Pennsylvania', 'New Jersey', 'Connecticut', 'Rhode Island', 'Vermont', 'New Hampshire', 'Maine'],
      '☀️ South': ['Florida', 'Texas', 'Georgia', 'North Carolina', 'Virginia', 'Tennessee', 'Maryland', 'Louisiana', 'South Carolina', 'Alabama', 'Kentucky', 'Oklahoma', 'Arkansas', 'Mississippi', 'West Virginia'],
      '🌾 Midwest': ['Illinois', 'Ohio', 'Michigan', 'Wisconsin', 'Minnesota', 'Missouri', 'Indiana', 'Iowa', 'Kansas', 'Nebraska', 'South Dakota', 'North Dakota'],
      '🏔️ West': ['California', 'Washington', 'Oregon', 'Colorado', 'Arizona', 'Nevada', 'Utah', 'New Mexico', 'Idaho', 'Montana', 'Wyoming', 'Alaska', 'Hawaii'],
    },
    emoji: '🇺🇸',
  },
  'Georgia': {
    nationwide: 'Countrywide',
    regions: {
      '🏛️ Tbilisi': ['Tbilisi', 'Rustavi', 'Mtskheta'],
      '🏖️ Adjara': ['Batumi', 'Kobuleti', 'Khelvachauri', 'Shuakhevi'],
      '🏰 Imereti': ['Kutaisi', 'Zestaponi', 'Chiatura', 'Khoni', 'Samtredia'],
      '🌄 Kvemo Kartli': ['Rustavi', 'Bolnisi', 'Gardabani', 'Marneuli', 'Tetritskaro'],
      '🍇 Kakheti': ['Telavi', 'Gurjaani', 'Sighnaghi', 'Sagarejo', 'Dedoplistskaro'],
      '🌊 Samegrelo-Zemo Svaneti': ['Zugdidi', 'Poti', 'Mestia', 'Senaki'],
      '⛰️ Shida Kartli': ['Gori', 'Kaspi', 'Kareli', 'Khashuri'],
      '♨️ Samtskhe-Javakheti': ['Akhaltsikhe', 'Borjomi', 'Akhalkalaki', 'Ninotsminda'],
      '🏔️ Mtskheta-Mtianeti': ['Mtskheta', 'Dusheti', 'Tianeti', 'Kazbegi'],
      '🌲 Racha-Lechkhumi': ['Ambrolauri', 'Oni', 'Tsageri', 'Lentekhi'],
      '🌳 Guria': ['Ozurgeti', 'Lanchkhuti', 'Chokhatauri'],
    },
    emoji: '🇬🇪',
  },
};

// Legacy export for backward compatibility
export const US_LOCATIONS = LOCATIONS_DATA['United States'];
