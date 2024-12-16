// Google OAuth Type Declarations

declare global {
    interface Window {
      google: {
        accounts: {
          oauth2: {
            initTokenClient: (config: {
              client_id?: string;
              scope: string;
              callback?: ((response: any) => void) | string;
            }) => {
              requestAccessToken: (options: { 
                prompt?: string 
              }) => void;
            };
            revoke: (token: string) => void;
          };
        };
      };
    }
  }
  
  // Export to make it a module
  export {};