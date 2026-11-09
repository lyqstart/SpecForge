const code=Number(process.argv[2]);if(![0,7].includes(code))throw Error('CANARY_EXIT_REQUIRED');setTimeout(()=>{console.log('explicit-carrier-canary-exit-'+code);process.exitCode=code;},250);
