import { AddonDetail, StreamRequest } from '@aiostreams/types';
import { ParsedStream, Stream, Config } from '@aiostreams/types';
import { BaseWrapper } from './base';
import { addonDetails } from '@aiostreams/utils';
import { Settings } from '@aiostreams/utils';

export class Debridio extends BaseWrapper {
  constructor(
    configString: string | null,
    overrideUrl: string | null,
    addonName: string = 'Debridio',
    addonId: string,
    userConfig: Config,
    indexerTimeout?: number
  ) {
    let url = overrideUrl
      ? overrideUrl
      : Settings.DEBRIDIO_URL + (configString ? configString + '/' : '');

    super(
      addonName,
      url,
      addonId,
      userConfig,
      indexerTimeout || Settings.DEFAULT_DEBRIDIO_TIMEOUT
    );
  }

  protected parseStream(stream: Stream): ParsedStream {
    const superParsedStream = super.parseStream(stream);

    if (!superParsedStream.provider) {
      superParsedStream.provider = {
        id: 'easydebrid',
        cached: false,
      };
    }

    return superParsedStream;
  }
}

const getDebridioConfigString = (provider: string, apiKey: string) => {
  const config = {
    provider,
    apiKey,
  };
  return Buffer.from(JSON.stringify(config)).toString('base64');
};

export async function getDebridioStreams(
  config: Config,
  debridioOptions: {
    prioritiseDebrid?: string;
    overrideName?: string;
    overrideUrl?: string;
    indexerTimeout?: string;
  },
  streamRequest: StreamRequest,
  addonId: string
): Promise<ParsedStream[]> {
  const supportedServices: string[] =
    addonDetails.find((addon: AddonDetail) => addon.id === 'debridio')
      ?.supportedServices || [];
  const parsedStreams: ParsedStream[] = [];
  const indexerTimeout = debridioOptions.indexerTimeout
    ? parseInt(debridioOptions.indexerTimeout)
    : undefined;

  // If overrideUrl is provided, use it to get streams and skip all other steps
  if (debridioOptions.overrideUrl) {
    const debridio = new Debridio(
      null,
      debridioOptions.overrideUrl as string,
      debridioOptions.overrideName,
      addonId,
      config,
      indexerTimeout
    );
    return debridio.getParsedStreams(streamRequest);
  }

  // find all usable and enabled services
  const usableServices = config.services.filter(
    (service) => supportedServices.includes(service.id) && service.enabled
  );

  // if no usable services found, throw an error
  if (usableServices.length < 1) {
    throw new Error('No supported service(s) enabled');
  }

  // otherwise, depending on the configuration, create multiple instances of comet or use a single instance with the prioritised service

  if (
    debridioOptions.prioritiseDebrid &&
    !supportedServices.includes(debridioOptions.prioritiseDebrid)
  ) {
    throw new Error('Invalid debrid service');
  }

  if (debridioOptions.prioritiseDebrid) {
    const debridService = usableServices.find(
      (service) => service.id === debridioOptions.prioritiseDebrid
    );
    if (!debridService) {
      throw new Error(
        'Debrid service not found for ' + debridioOptions.prioritiseDebrid
      );
    }
    if (!debridService.credentials.apiKey) {
      throw new Error(
        'Debrid service API key not found for ' +
          debridioOptions.prioritiseDebrid
      );
    }

    // get the comet config and b64 encode it
    const debridioConfigString = getDebridioConfigString(
      debridioOptions.prioritiseDebrid,
      debridService.credentials.apiKey
    );

    const debridio = new Debridio(
      debridioConfigString,
      null,
      debridioOptions.overrideName,
      addonId,
      config,
      indexerTimeout
    );

    return debridio.getParsedStreams(streamRequest);
  }

  // if no prioritised service is provided, create a debridio instance for each service
  const servicesToUse = usableServices.filter((service) => service.enabled);
  if (servicesToUse.length < 1) {
    throw new Error('No supported service(s) enabled');
  }

  const streamPromises = servicesToUse.map(async (service) => {
    const debridioConfigString = getDebridioConfigString(
      service.id,
      service.credentials.apiKey
    );
    const debridio = new Debridio(
      debridioConfigString,
      null,
      debridioOptions.overrideName,
      addonId,
      config,
      indexerTimeout
    );
    return debridio.getParsedStreams(streamRequest);
  });

  const streamsArray = await Promise.all(streamPromises);
  streamsArray.forEach((streams) => parsedStreams.push(...streams));

  return parsedStreams;
}
