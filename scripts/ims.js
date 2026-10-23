/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

export const imsReady = new Event('imsReady');
export const imsError = new Event('imsError');
export const imsGetProfile = new Event('imsGetProfile');
export const imsGetProfileSuccess = new Event('imsGetProfileSuccess');
export const imsGetProfileError = new Event('imsGetProfileError');

export const LoadingState = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
};

export function createTag(name, attrs) {
  const el = document.createElement(name);
  if (typeof attrs === 'object' && attrs !== null) {
    Object.entries(attrs).forEach(([key, value]) => {
      el.setAttribute(key, value);
    });
  }
  return el;
}

export function isHlxPath(host) {
  return host.indexOf('hlx.page') >= 0
    || host.indexOf('hlx.live') >= 0
    || host.indexOf('localhost') >= 0
    || host.indexOf('aem.page') >= 0
    || host.indexOf('aem.live') >= 0;
}

export function setExpectedAccountOrigin(suffix = '') {
  return `https://account.adobe.com${suffix}`;
}

export function addExtraScript(element, scriptUrl) {
  const script = createTag('script', { type: 'text/javascript' });
  script.src = scriptUrl;
  element.appendChild(script);
}

export function globalSpinner() {
  const div = createTag('div', { id: 'nav-spinner', class: 'nav-spinner-container', style: 'display: none;' });
  div.innerHTML = '<div class="spinner"></div>';
  return div;
}

export function globalSignIn() {
  const div = createTag('div', { id: 'nav-sign-in', class: 'nav-sign-in' });
  div.innerHTML = `<button class="spectrum-ActionButton spectrum-ActionButton--sizeM spectrum-ActionButton--quiet">
    <span id="signIn" class="spectrum-ActionButton-label" daa-ll="sign-in-button">Sign in</span>
  </button>`;
  return div;
}

export function hideSpinner() {
  const spinner = document.querySelector('#nav-spinner');
  if (spinner) {
    spinner.style.display = 'none';
  }
}

export function showSpinner() {
  const spinner = document.querySelector('#nav-spinner');
  if (spinner) {
    spinner.style.display = 'block';
  }
}

export function hideSignIn() {
  const signIn = document.querySelector('#nav-sign-in');
  if (signIn) {
    signIn.style.display = 'none';
  }
}

export function showSignIn() {
  const signIn = document.querySelector('#nav-sign-in');
  if (signIn) {
    signIn.style.display = 'block';
    if (!signIn.dataset.hasListener) {
      signIn.dataset.hasListener = 'true';
      signIn.addEventListener('click', () => {
        if (window.adobeIMS && window.adobeIMS.signIn) {
          window.adobeIMS.signIn();
        }
      });
    }
  }
}

export function setIMSParams(clientId, scope, environment, logsEnabled, resolve, reject, timeout) {
  window.adobeid = {
    client_id: clientId,
    scope,
    locale: 'en_US',
    environment,
    useLocalStorage: false,
    logsEnabled,
    redirect_uri: window.location.href,
    autoValidateToken: true,
    alwaysRemoveTokenFromUrl: true,
    onReady: () => {
      window.adp = window.adp || {};
      window.dispatchEvent(imsReady);
      window.dispatchEvent(imsGetProfile);
      if (window.adobeIMS && window.adobeIMS.isSignedInUser && window.adobeIMS.isSignedInUser()) {
        window.adobeIMS.getProfile().then((profile) => {
          window.adobeid.profile = profile;
          window.adobeid.profile.avatarUrl = '/img/icons/avatar.svg';
          window.dispatchEvent(imsGetProfileSuccess);
        })
          .catch((ex) => {
            window.dispatchEvent(imsGetProfileError, ex);
          });
      } else {
        window.dispatchEvent(imsGetProfileError);
      }
      resolve();
      clearTimeout(timeout);
    },
    onError: (error) => {
      window.dispatchEvent(imsError);
      reject(error);
    },
  };
}

export async function loadIms() {
  window.imsLoaded = window.imsLoaded
    || new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.dispatchEvent(imsError);
        reject(new Error('IMS timeout'));
      }, 5000);

      const { host } = window.location;
      // Environments:
      // Production: https://blog.developer.adobe.com/ -> clientId: 'adobe_io'
      // Preview/Dev: https://main--devblog--adobecom.aem.page/ -> clientId: 'helix_adobeio'
      // Both use production IMS (no stage account)
      let clientId = 'adobe_io';
      let scope = 'AdobeID,openid,unified_dev_portal,read_organizations,additional_info.projectedProductContext,additional_info.roles,gnav,read_pc.dma_bullseye,creative_sdk,adobeio_api,read_client_secret,openid,service_principals.write';
      const environment = 'prod';
      const logsEnabled = isHlxPath(host);

      if (isHlxPath(host)) {
        clientId = 'helix_adobeio';
        scope = 'AdobeID,openid,read_organizations,additional_info.projectedProductContext,additional_info.roles,gnav,read_pc.dma_bullseye,creative_sdk,adobeio_api';
      }

      setIMSParams(clientId, scope, environment, logsEnabled, resolve, reject, timeout);
      addExtraScript(document.body, 'https://auth.services.adobe.com/imslib/imslib.min.js');
    });
  return window.imsLoaded;
}

export function globalNavProfileTemplate(profile) {
  const accountUrl = setExpectedAccountOrigin();
  const avatarUrl = profile.avatarUrl || '/img/icons/avatar.svg';
  const name = profile.name || '';
  return `
    <div class="nav-profile spectrum--lightest">
      <button id="nav-profile-dropdown-button" class="spectrum-ActionButton spectrum-ActionButton--sizeM spectrum-ActionButton--quiet navigation-dropdown" daa-ll="profile-dropdown-button" aria-haspopup="true" aria-expanded="false" aria-label="Profile">
        <svg class="spectrum-Icon spectrum-Icon--sizeM" focusable="false" aria-hidden="true" aria-label="Profile" viewBox="0 0 36 36">
          <circle cx="18" cy="12" r="7" />
          <path d="M18 21c-7.7 0-14 4.3-14 9.5V33h28v-2.5c0-5.2-6.3-9.5-14-9.5z" />
        </svg>
      </button>
      <div id="nav-profile-dropdown-popover" class="spectrum-Popover spectrum-Popover--bottom spectrum-Picker-popover spectrum-Picker-popover--quiet" aria-hidden="true">
        <div class="nav-profile-popover-innerContainer">
          <div class="nav-profile-popover-avatar">
            <img alt="Avatar" id="nav-profile-popover-avatar-img" src="${avatarUrl}" />
          </div>
          <div class="nav-profile-popover-name">
            <h1 id="nav-profile-popover-name" class="spectrum-Heading spectrum-Heading--sizeM">
              ${name}
            </h1>
          </div>
          <div class="nav-profile-popover-divider">
            <hr />
          </div>
          <a href="${accountUrl}" data-prefetch="false" class="spectrum-Button spectrum-Button--primary spectrum-Button--quiet spectrum-Button--sizeM nav-profile-popover-edit" daa-ll="profile-edit-button">
            Edit Profile
          </a>
          <a href="#" id="signOut" data-prefetch="false" class="spectrum-Button spectrum-Button--secondary spectrum-Button--sizeM nav-profile-popover-sign-out" daa-ll="profile-sign-out-button">
            Sign out
          </a>
        </div>
      </div>
    </div>
  `;
}

export function decorateProfile(profile) {
  const signIn = document.querySelector('div.nav-sign-in');
  if (!signIn) return;
  const parentContainer = signIn.parentElement;
  signIn.remove();
  parentContainer.insertAdjacentHTML('beforeend', globalNavProfileTemplate(profile));

  const profileDropdownPopover = parentContainer.querySelector('div#nav-profile-dropdown-popover');
  const button = parentContainer.querySelector('button#nav-profile-dropdown-button');

  if (button && profileDropdownPopover) {
    button.addEventListener('click', (evt) => {
      evt.stopPropagation();
      const isOpen = button.classList.contains('is-open');
      if (!isOpen) {
        button.classList.add('is-open');
        button.setAttribute('aria-expanded', 'true');
        profileDropdownPopover.classList.add('is-open');
        profileDropdownPopover.setAttribute('aria-hidden', 'false');
      } else {
        button.classList.remove('is-open');
        button.setAttribute('aria-expanded', 'false');
        profileDropdownPopover.classList.remove('is-open');
        profileDropdownPopover.setAttribute('aria-hidden', 'true');
      }
    });

    document.addEventListener('click', (evt) => {
      if (!parentContainer.contains(evt.target) && button.classList.contains('is-open')) {
        button.classList.remove('is-open');
        button.setAttribute('aria-expanded', 'false');
        profileDropdownPopover.classList.remove('is-open');
        profileDropdownPopover.setAttribute('aria-hidden', 'true');
      }
    });
  }

  const signOut = parentContainer.querySelector('#signOut');
  signOut?.addEventListener('click', (evt) => {
    evt.preventDefault();
    if (window.adobeIMS && window.adobeIMS.signOut) {
      window.adobeIMS.signOut();
    }
  });
}

export async function fetchProfileAvatar(userId) {
  try {
    const req = await fetch(`https://cc-api-behance.adobe.io/v2/users/${userId}?api_key=SUSI2`);
    if (req.ok) {
      const res = await req.json();
      const avatarUrl = res?.user?.images?.['138'] ?? '/img/icons/avatar.svg';
      const avatarImg = document.querySelector('#nav-profile-popover-avatar-img');
      if (avatarImg) {
        avatarImg.src = avatarUrl;
      }

      const profileButton = document.querySelector('#nav-profile-dropdown-button');
      if (profileButton) {
        const svg = profileButton.querySelector('svg');
        if (svg) svg.remove();
        profileButton.innerHTML = `
          <div class="nav-profile-popover-avatar-button">
            <img alt="Avatar" src="${avatarUrl}" />
          </div>
        `;
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Error fetching avatar:', e);
  }
}

export function getSubscribeItem(container = document) {
  const subscribeSelector = '.feds-navItem:has(> button[daa-ll^="Subscribe"]), .feds-navItem:has(> a[daa-ll^="Subscribe"]), .feds-navItem button[daa-ll^="Subscribe"], .feds-navItem a[daa-ll^="Subscribe"], .feds-navItem:has([daa-ll*="Subscribe" i])';
  const match = container.querySelector(subscribeSelector);
  if (match) return match.closest('.feds-navItem') || match;

  return Array.from(container.querySelectorAll('.feds-navItem')).find((el) => {
    const text = el.textContent.trim().toLowerCase();
    return text.startsWith('subscribe');
  });
}

export function setupHeaderSignIn() {
  function insertSignInElements() {
    const nav = document.querySelector('.feds-nav');
    if (!nav) return false;

    let spinner = document.querySelector('#nav-spinner');
    let signIn = document.querySelector('#nav-sign-in');

    if (!spinner) {
      spinner = globalSpinner();
    }
    if (!signIn) {
      signIn = globalSignIn();
    }

    const subscribeItem = getSubscribeItem(nav);
    if (subscribeItem) {
      const isBeforeOther = subscribeItem.nextElementSibling !== spinner
        && subscribeItem.nextElementSibling !== signIn;
      if (isBeforeOther) {
        subscribeItem.after(spinner, signIn);
      }
      return true;
    }

    if (!nav.contains(spinner) && !nav.contains(signIn)) {
      nav.appendChild(spinner);
      nav.appendChild(signIn);
    }
    return false;
  }

  insertSignInElements();

  const observer = new MutationObserver(() => {
    const nav = document.querySelector('.feds-nav');
    if (nav) {
      const subscribeItem = getSubscribeItem(nav);
      const signIn = document.querySelector('#nav-sign-in') || document.querySelector('.nav-profile');
      const spinner = document.querySelector('#nav-spinner');
      if (subscribeItem && signIn && spinner) {
        const isBeforeOther = subscribeItem.nextElementSibling !== spinner
          && subscribeItem.nextElementSibling !== signIn;
        if (isBeforeOther) {
          subscribeItem.after(spinner, signIn);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  showSpinner();

  const decorateProfileWhenReady = (profile, attempts = 0) => {
    const signInElement = document.querySelector('div.nav-sign-in');
    if (signInElement) {
      decorateProfile(profile);
      if (profile.userId) fetchProfileAvatar(profile.userId);
    } else if (attempts < 10) {
      requestAnimationFrame(() => {
        decorateProfileWhenReady(profile, attempts + 1);
      });
    } else {
      setTimeout(() => {
        const signInRetry = document.querySelector('div.nav-sign-in');
        if (signInRetry && window.adobeid && window.adobeid.profile) {
          decorateProfile(window.adobeid.profile);
          if (window.adobeid.profile.userId) fetchProfileAvatar(window.adobeid.profile.userId);
        }
      }, 100);
    }
  };

  window.addEventListener('imsReady', () => {
    hideSpinner();
    showSignIn();
  });

  window.addEventListener('imsError', () => {
    hideSpinner();
    showSignIn();
  });

  window.addEventListener('imsGetProfile', () => {
    hideSignIn();
    showSpinner();
  });

  window.addEventListener('imsGetProfileSuccess', () => {
    hideSpinner();
    if (window.adobeid && window.adobeid.profile) {
      decorateProfileWhenReady(window.adobeid.profile);
    }
  });

  window.addEventListener('imsGetProfileError', () => {
    hideSpinner();
    showSignIn();
  });

  if (window.adobeIMS && typeof window.adobeIMS.isSignedInUser === 'function') {
    if (window.adobeIMS.isSignedInUser()) {
      hideSignIn();
      showSpinner();
      window.adobeIMS.getProfile().then((profile) => {
        window.adobeid = window.adobeid || {};
        window.adobeid.profile = profile;
        window.adobeid.profile.avatarUrl = '/img/icons/avatar.svg';
        hideSpinner();
        decorateProfileWhenReady(profile);
      }).catch((ex) => {
        window.dispatchEvent(imsGetProfileError, ex);
        hideSpinner();
        showSignIn();
      });
    } else {
      hideSpinner();
      showSignIn();
    }
  }

  loadIms().then(() => {
    if (window.adobeImsFactory && window.adobeImsFactory.createIMSLib) {
      window.adobeImsFactory.createIMSLib(window.adobeid);
    }

    if (window.adobeIMS && window.adobeIMS.initialize) {
      window.adobeIMS.initialize();
    }
  }).catch(() => {
    hideSpinner();
    showSignIn();
  });
}
