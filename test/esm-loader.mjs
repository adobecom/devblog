// Custom loader to treat our source .js files as ES modules
export async function resolve(specifier, context, defaultResolve) {
  const resolved = await defaultResolve(specifier, context, defaultResolve);
  
  // Force .js files in our project (not node_modules) to be treated as ES modules
  // EXCEPT sort-paths.js which uses CommonJS module.exports
  if (resolved.url && 
      resolved.url.includes('/workspace/adobe/2025/devblog/') && 
      !resolved.url.includes('/node_modules/') &&
      !resolved.url.includes('/sorted-index/sort-paths.js') &&
      resolved.url.endsWith('.js')) {
    return {
      ...resolved,
      format: 'module'
    };
  }
  
  return resolved;
}

