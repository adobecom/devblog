// Redirect /tagged to the target path defined in our source document
// This works together with a '/tagged: /en/generic-tagged' folders definition in fstab.yaml
// And the /en/generic-tagged document which includes this block with a 'target' property that defines the target path
export default async function init(blockEl) {
  const tag = window.location.pathname.match(/tagged\/(.*)/)[1];
  // the block has a "target" property pointing to our redirect target
  const targetName = 'target';
  const nameDiv = Array.from(blockEl.querySelectorAll('div')).find(div => div.textContent?.trim() === targetName);
  const targetDiv = nameDiv?.nextElementSibling;
  if(targetDiv) {
    const targetPath = `${targetDiv.textContent?.trim()}/${tag}`;
    window.location = targetPath;
  } else {
    console.warn('missing block property:', targetName);
  }
}