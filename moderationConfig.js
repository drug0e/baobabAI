module.exports = {
  visionModeration: {
    inappropriate: [
      'Sexual or explicit content',
      'War footage showing combat, destruction, corpses, or battlefield violence',
      'Animal abuse',
      'Human abuse or torture',
      'Visual instructions or scenes showing creation of explosive devices',
      'Recruitment propaganda for any sects, extremist groups, or organizations',
      'Advertisements or promotional content',
      'Any content related to the production or use of narcotic substances'
    ],
    allowedExceptions: [
      'video game frames',
      'military equipment only (no destruction/violence)'
    ],
    severityPolicy: [
      { threshold: 'mild', muteHours: 12 },
      { threshold: 'medium', muteHours: 24 },
      { threshold: 'severe', muteHours: 72 }
    ]
  },
  virusTotal: {
    detectionMutePolicy: [
      { min: 0.05, max: 0.10, muteHours: 12 },
      { min: 0.10, max: 0.25, muteHours: 24 },
      { min: 0.25, max: 1.00, muteHours: 72 }
    ],
    detectionThreshold: 0.05
  }
};
