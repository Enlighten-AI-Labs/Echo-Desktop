import React from 'react';
import styles from './AiPromptModal.module.css';

const VerticalSelectionStep = ({ selectedVertical, onSelectVertical }) => {
  return (
    <div className={styles.verticalSelectionStep}>
      <h3>Select a Vertical</h3>
      <p>Choose the industry vertical that best matches your app.</p>
      
      <div className={styles.verticalGrid}>
        {/* QSR Vertical */}
        <div 
          className={`${styles.verticalItem} ${selectedVertical === 'QSR' ? styles.selectedVertical : ''}`}
          onClick={() => onSelectVertical('QSR')}
        >
          <div className={styles.verticalIcon}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="32" height="32" fill="currentColor">
              <path d="M61.1 224C45 224 32 211 32 194.9c0-1.9 .2-3.7 .6-5.6C37.9 168.3 78.8 32 256 32s218.1 136.3 223.4 157.3c.5 1.9 .6 3.7 .6 5.6c0 16.1-13 29.1-29.1 29.1H61.1zM144 128a16 16 0 1 0 -32 0 16 16 0 1 0 32 0zm240 16a16 16 0 1 0 0-32 16 16 0 1 0 0 32zM272 96a16 16 0 1 0 -32 0 16 16 0 1 0 32 0zM16 304c0-26.5 21.5-48 48-48H448c26.5 0 48 21.5 48 48s-21.5 48-48 48H64c-26.5 0-48-21.5-48-48zm16 96c0-8.8 7.2-16 16-16H464c8.8 0 16 7.2 16 16v16c0 35.3-28.7 64-64 64H96c-35.3 0-64-28.7-64-64V400z"/>
            </svg>
          </div>
          <div className={styles.verticalLabel}>QSR</div>
          <div className={styles.verticalDescription}>Quick Service Restaurants</div>
        </div>
        
        {/* Retail & E-Commerce */}
        <div 
          className={`${styles.verticalItem} ${selectedVertical === 'Retail & E-Commerce' ? styles.selectedVertical : ''}`}
          onClick={() => onSelectVertical('Retail & E-Commerce')}
        >
          <div className={styles.verticalIcon}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="32" height="32" fill="currentColor">
              <path d="M160 112c0-35.3 28.7-64 64-64s64 28.7 64 64v48H160V112zm-48 48H48c-26.5 0-48 21.5-48 48V416c0 53 43 96 96 96H352c53 0 96-43 96-96V208c0-26.5-21.5-48-48-48H336V112C336 50.1 285.9 0 224 0S112 50.1 112 112v48zm24 48a24 24 0 1 1 0 48 24 24 0 1 1 0-48zm152 24a24 24 0 1 1 48 0 24 24 0 1 1 -48 0z"/>
            </svg>
          </div>
          <div className={styles.verticalLabel}>Retail & E-Commerce</div>
          <div className={styles.verticalDescription}>Online and physical stores</div>
        </div>
        
        {/* Financial Services */}
        <div 
          className={`${styles.verticalItem} ${selectedVertical === 'Financial Services' ? styles.selectedVertical : ''}`}
          onClick={() => onSelectVertical('Financial Services')}
        >
          <div className={styles.verticalIcon}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" width="32" height="32" fill="currentColor">
              <path d="M64 64C28.7 64 0 92.7 0 128V384c0 35.3 28.7 64 64 64H512c35.3 0 64-28.7 64-64V128c0-35.3-28.7-64-64-64H64zm64 320H64V320c35.3 0 64 28.7 64 64zM64 192V128h64c0 35.3-28.7 64-64 64zM448 384c0-35.3 28.7-64 64-64v64H448zm64-192c-35.3 0-64-28.7-64-64h64v64zM288 160a96 96 0 1 1 0 192 96 96 0 1 1 0-192z"/>
            </svg>
          </div>
          <div className={styles.verticalLabel}>Financial Services</div>
          <div className={styles.verticalDescription}>Banking, investing, payments</div>
        </div>
        
        {/* Travel & Hospitality */}
        <div 
          className={`${styles.verticalItem} ${selectedVertical === 'Travel & Hospitality' ? styles.selectedVertical : ''}`}
          onClick={() => onSelectVertical('Travel & Hospitality')}
        >
          <div className={styles.verticalIcon}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" width="32" height="32" fill="currentColor">
              <path d="M482.3 192c34.2 0 93.7 29 93.7 64c0 36-59.5 64-93.7 64l-116.6 0L265.2 495.9c-5.7 10-16.3 16.1-27.8 16.1l-56.2 0c-10.6 0-18.3-10.2-15.4-20.4l49-171.6L112 320 68.8 377.6c-3 4-7.8 6.4-12.8 6.4l-42 0c-7.8 0-14-6.3-14-14c0-1.3 .2-2.6 .5-3.9L32 256 .5 145.9c-.4-1.3-.5-2.6-.5-3.9c0-7.8 6.3-14 14-14l42 0c5 0 9.8 2.4 12.8 6.4L112 192l102.9 0-49-171.6C162.9 10.2 170.6 0 181.2 0l56.2 0c11.5 0 22.1 6.2 27.8 16.1L365.7 192l116.6 0z"/>
            </svg>
          </div>
          <div className={styles.verticalLabel}>Travel & Hospitality</div>
          <div className={styles.verticalDescription}>Hotels, airlines, booking</div>
        </div>
        
        {/* Healthcare & Pharma */}
        <div 
          className={`${styles.verticalItem} ${selectedVertical === 'Healthcare & Pharma' ? styles.selectedVertical : ''}`}
          onClick={() => onSelectVertical('Healthcare & Pharma')}
        >
          <div className={styles.verticalIcon}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" width="32" height="32" fill="currentColor">
              <path d="M48 0C21.5 0 0 21.5 0 48V368c0 26.5 21.5 48 48 48H128c0 35.3 28.7 64 64 64s64-28.7 64-64H320c0 35.3 28.7 64 64 64s64-28.7 64-64h80c26.5 0 48-21.5 48-48V48c0-26.5-21.5-48-48-48H48zM192 416a32 32 0 1 1 0 64 32 32 0 1 1 0-64zm160 0a32 32 0 1 1 0 64 32 32 0 1 1 0-64zM48 48H528c0 26.5-21.5 48-48 48H96C69.5 96 48 74.5 48 48zM96 128H528V368c0 8.8-7.2 16-16 16H480c-8.8 0-16-7.2-16-16V352c0-17.7-14.3-32-32-32s-32 14.3-32 32v16c0 8.8-7.2 16-16 16H192c-8.8 0-16-7.2-16-16V352c0-17.7-14.3-32-32-32s-32 14.3-32 32v16c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V128zm32 88v48c0 13.3 10.7 24 24 24h80c13.3 0 24-10.7 24-24V216c0-13.3-10.7-24-24-24H152c-13.3 0-24 10.7-24 24zm136-24h80c13.3 0 24 10.7 24 24v48c0 13.3-10.7 24-24 24H264c-13.3 0-24-10.7-24-24V216c0-13.3 10.7-24 24-24z"/>
            </svg>
          </div>
          <div className={styles.verticalLabel}>Healthcare & Pharma</div>
          <div className={styles.verticalDescription}>Medical services and apps</div>
        </div>
        
        {/* Media & Entertainment */}
        <div 
          className={`${styles.verticalItem} ${selectedVertical === 'Media & Entertainment' ? styles.selectedVertical : ''}`}
          onClick={() => onSelectVertical('Media & Entertainment')}
        >
          <div className={styles.verticalIcon}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" width="32" height="32" fill="currentColor">
              <path d="M64 64V352H576V64H64zM0 64C0 28.7 28.7 0 64 0H576c35.3 0 64 28.7 64 64V352c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V64zM128 448H512c17.7 0 32 14.3 32 32s-14.3 32-32 32H128c-17.7 0-32-14.3-32-32s14.3-32 32-32z"/>
            </svg>
          </div>
          <div className={styles.verticalLabel}>Media & Entertainment</div>
          <div className={styles.verticalDescription}>Streaming, content, games</div>
        </div>
        
        {/* Telecommunications */}
        <div 
          className={`${styles.verticalItem} ${selectedVertical === 'Telecommunications' ? styles.selectedVertical : ''}`}
          onClick={() => onSelectVertical('Telecommunications')}
        >
          <div className={styles.verticalIcon}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="32" height="32" fill="currentColor">
              <path d="M164.9 24.6c-7.7-18.6-28-28.5-47.4-23.2l-88 24C12.1 30.2 0 46 0 64C0 311.4 200.6 512 448 512c18 0 33.8-12.1 38.6-29.5l24-88c5.3-19.4-4.6-39.7-23.2-47.4l-96-40c-16.3-6.8-35.2-2.1-46.3 11.6L304.7 368C234.3 334.7 177.3 277.7 144 207.3L193.3 167c13.7-11.2 18.4-30 11.6-46.3l-40-96z"/>
            </svg>
          </div>
          <div className={styles.verticalLabel}>Telecommunications</div>
          <div className={styles.verticalDescription}>Mobile carriers, services</div>
        </div>
        
        {/* Insurance */}
        <div 
          className={`${styles.verticalItem} ${selectedVertical === 'Insurance' ? styles.selectedVertical : ''}`}
          onClick={() => onSelectVertical('Insurance')}
        >
          <div className={styles.verticalIcon}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="32" height="32" fill="currentColor">
              <path d="M256 0c4.6 0 9.2 1 13.4 2.9L457.7 82.8c22 9.3 38.4 31 38.3 57.2c-.5 99.2-41.3 280.7-213.6 363.2c-16.7 8-36.1 8-52.8 0C57.3 420.7 16.5 239.2 16 140c-.1-26.2 16.3-47.9 38.3-57.2L242.7 2.9C246.8 1 251.4 0 256 0zm0 66.8V444.8C394 378 431.1 230.1 432 141.4L256 66.8l0 0z"/>
            </svg>
          </div>
          <div className={styles.verticalLabel}>Insurance</div>
          <div className={styles.verticalDescription}>Auto, home, life coverage</div>
        </div>
      </div>
    </div>
  );
};

export default VerticalSelectionStep; 